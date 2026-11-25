package handlers_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

// TestProjectFavoritesPostgres checks personal project favourites (#232) against the real schema.
func TestProjectFavoritesPostgres(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("set TEST_DATABASE_URL to run against a migrated PostgreSQL database")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := tx.Rollback(ctx); err != nil && !errors.Is(err, pgx.ErrTxClosed) {
			t.Error(err)
		}
	}()
	queries := db.New(tx)
	fixture := authtest.NewFixture(t, queries)
	handler := httpapi.New(db.NewStore(tx), fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))

	// alice creates the project. bob is the user the fake directory finds as new@example.com.
	alice := "Bearer " + fixture.Token(t, nil)
	bob := "Bearer " + fixture.Token(t, map[string]any{"sub": "new-sub"})
	bobInTeam := "Bearer " + fixture.Token(t, map[string]any{"sub": "new-sub", "taramisu_groups": []string{teamGroupID}})

	call := func(token, method, path, body string, want int) []byte {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", token)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		return rr.Body.Bytes()
	}
	decode := func(data []byte, target any) {
		t.Helper()
		if err := json.Unmarshal(data, target); err != nil {
			t.Fatal(err)
		}
	}
	isFavorite := func(token, path string) bool {
		t.Helper()
		var p handlers.TaraProjectBody
		decode(call(token, http.MethodGet, path, "", http.StatusOK), &p)
		return p.IsFavorite
	}
	favoriteIDs := func(token string) []string {
		t.Helper()
		var list []handlers.TaraProjectBody
		decode(call(token, http.MethodGet, "/api/v1/projects?favorite=true", "", http.StatusOK), &list)
		ids := make([]string, 0, len(list))
		for _, p := range list {
			if !p.IsFavorite {
				t.Fatalf("favourite filter returned a project that is no favourite: %+v", p)
			}
			ids = append(ids, p.ID)
		}
		return ids
	}
	storedFavorites := func(projectID string) int {
		t.Helper()
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM project_favorite WHERE tara_project_id = $1`, projectID).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	var project, other handlers.TaraProjectBody
	decode(call(alice, http.MethodPost, "/api/v1/projects", `{"name":"Favourite"}`, http.StatusCreated), &project)
	decode(call(alice, http.MethodPost, "/api/v1/projects", `{"name":"Other"}`, http.StatusCreated), &other)
	if project.IsFavorite {
		t.Fatal("a new project must not be a favourite")
	}
	path := "/api/v1/projects/" + project.ID
	favorite := path + "/favorite"
	members := path + "/members"

	// Adding and removing are idempotent; removing a favourite keeps the project.
	call(alice, http.MethodPut, favorite, "", http.StatusNoContent)
	call(alice, http.MethodPut, favorite, "", http.StatusNoContent)
	if !isFavorite(alice, path) || storedFavorites(project.ID) != 1 {
		t.Fatal("favourite not stored once")
	}
	if ids := favoriteIDs(alice); len(ids) != 1 || ids[0] != project.ID {
		t.Fatalf("alice's favourites = %v, want only %s", ids, project.ID)
	}
	call(alice, http.MethodDelete, favorite, "", http.StatusNoContent)
	call(alice, http.MethodDelete, favorite, "", http.StatusNoContent)
	if isFavorite(alice, path) || len(favoriteIDs(alice)) != 0 {
		t.Fatal("favourite not removed")
	}
	call(alice, http.MethodPut, favorite, "", http.StatusNoContent)

	// Without a role, bob cannot mark the project.
	call(bob, http.MethodPut, favorite, "", http.StatusNotFound)

	// Favourites are personal: alice's favourite is not bob's, and bob's is not alice's.
	var bobMember handlers.ProjectMember
	decode(call(alice, http.MethodPost, members, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusCreated), &bobMember)
	if isFavorite(bob, path) || len(favoriteIDs(bob)) != 0 {
		t.Fatal("alice's favourite is visible to bob")
	}
	call(bob, http.MethodPut, favorite, "", http.StatusNoContent)
	call(alice, http.MethodDelete, favorite, "", http.StatusNoContent)
	if !isFavorite(bob, path) || isFavorite(alice, path) {
		t.Fatal("removing alice's favourite changed bob's")
	}

	// Losing the direct assignment removes the favourite.
	call(alice, http.MethodDelete, members+"/"+bobMember.ID, "", http.StatusNoContent)
	if n := storedFavorites(project.ID); n != 0 {
		t.Fatalf("favourites after removing bob = %d, want 0", n)
	}

	// Access through a group: the favourite is hidden once the group assignment is gone.
	var team handlers.ProjectMember
	decode(call(alice, http.MethodPost, members, `{"group_id":"`+teamGroupID+`","role":"VIEWER"}`, http.StatusCreated), &team)
	call(bobInTeam, http.MethodPut, favorite, "", http.StatusNoContent)
	call(alice, http.MethodDelete, members+"/"+team.ID, "", http.StatusNoContent)
	call(bobInTeam, http.MethodGet, path, "", http.StatusNotFound)
	if ids := favoriteIDs(bobInTeam); len(ids) != 0 {
		t.Fatalf("bob still lists favourites without access: %v", ids)
	}

	// Deleting the project deletes its favourites, but not the users or other projects.
	call(alice, http.MethodPut, favorite, "", http.StatusNoContent)
	call(alice, http.MethodPut, "/api/v1/projects/"+other.ID+"/favorite", "", http.StatusNoContent)
	call(alice, http.MethodDelete, path, "", http.StatusNoContent)
	if n := storedFavorites(project.ID); n != 0 {
		t.Fatalf("favourites after deleting the project = %d, want 0", n)
	}
	if ids := favoriteIDs(alice); len(ids) != 1 || ids[0] != other.ID {
		t.Fatalf("alice's favourites after delete = %v, want only %s", ids, other.ID)
	}
}
