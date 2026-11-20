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

// TestProjectRolesPostgres walks through the role rules of
// docs/internal/architecture/iam/project-roles.md against the real schema.
func TestProjectRolesPostgres(t *testing.T) {
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
	handler := httpapi.New(queries, fixture.Manager, httpapi.WithDirectory(&fakeDirectory{}))

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
	roleOf := func(token, path string) db.ProjectRole {
		t.Helper()
		var p handlers.TaraProjectBody
		decode(call(token, http.MethodGet, path, "", http.StatusOK), &p)
		return p.Role
	}

	// The creator becomes the first Owner.
	var project handlers.TaraProjectBody
	decode(call(alice, http.MethodPost, "/api/v1/projects", `{"name":"Roles"}`, http.StatusCreated), &project)
	path := "/api/v1/projects/" + project.ID
	members := path + "/members"
	var list []handlers.ProjectMember
	decode(call(alice, http.MethodGet, members, "", http.StatusOK), &list)
	if len(list) != 1 || list[0].Role != db.ProjectRoleOWNER || list[0].Type != "user" {
		t.Fatalf("initial members = %+v", list)
	}
	aliceMember := members + "/" + list[0].ID

	// Without a role, bob cannot see the project at all.
	call(bob, http.MethodGet, path, "", http.StatusNotFound)
	var bobProjects []handlers.TaraProjectBody
	decode(call(bob, http.MethodGet, "/api/v1/projects", "", http.StatusOK), &bobProjects)
	for _, p := range bobProjects {
		if p.ID == project.ID {
			t.Fatal("project listed for a user without a role")
		}
	}

	// The last user Owner is protected, and a group Owner does not count.
	call(alice, http.MethodPatch, aliceMember, `{"role":"EDITOR"}`, http.StatusConflict)
	call(alice, http.MethodPost, members, `{"group_id":"`+teamGroupID+`","role":"OWNER"}`, http.StatusCreated)
	call(alice, http.MethodPatch, aliceMember, `{"role":"EDITOR"}`, http.StatusConflict)

	// bob joins as Viewer.
	var bobMember handlers.ProjectMember
	decode(call(alice, http.MethodPost, members, `{"email":"new@example.com","role":"VIEWER"}`, http.StatusCreated), &bobMember)
	if got := roleOf(bob, path); got != db.ProjectRoleVIEWER {
		t.Fatalf("bob's direct role = %q, want VIEWER", got)
	}
	call(bob, http.MethodPatch, path, `{"name":"x"}`, http.StatusForbidden)

	// The highest role wins: the team group makes bob Owner while the token carries the group.
	if got := roleOf(bobInTeam, path); got != db.ProjectRoleOWNER {
		t.Fatalf("bob's role with team group = %q, want OWNER", got)
	}
	decode(call(bobInTeam, http.MethodGet, "/api/v1/projects", "", http.StatusOK), &bobProjects)
	if len(bobProjects) == 0 || bobProjects[0].ID != project.ID || bobProjects[0].Role != db.ProjectRoleOWNER {
		t.Fatalf("bob's project list with team group = %+v", bobProjects)
	}

	// Ownership transfer: alice makes bob Owner, then steps down.
	call(alice, http.MethodPatch, members+"/"+bobMember.ID, `{"role":"OWNER"}`, http.StatusOK)
	call(alice, http.MethodPatch, aliceMember, `{"role":"EDITOR"}`, http.StatusOK)
	if got := roleOf(alice, path); got != db.ProjectRoleEDITOR {
		t.Fatalf("alice's role after transfer = %q, want EDITOR", got)
	}

	// bob removes alice; bob, now the last user Owner, cannot leave.
	call(bob, http.MethodDelete, aliceMember, "", http.StatusNoContent)
	call(alice, http.MethodGet, path, "", http.StatusNotFound)
	call(bob, http.MethodDelete, members+"/"+bobMember.ID, "", http.StatusConflict)

	// Parent lookups used by handlers below a project.
	var itemID, threatID string
	if err := tx.QueryRow(ctx, `INSERT INTO item_definition (tara_project_id, name, scope_type) VALUES ($1, 'Item', 'ITEM') RETURNING id::text`, project.ID).Scan(&itemID); err != nil {
		t.Fatal(err)
	}
	if err := tx.QueryRow(ctx, `INSERT INTO threat_scenario (item_definition_id, title) VALUES ($1, 'Threat') RETURNING id::text`, itemID).Scan(&threatID); err != nil {
		t.Fatal(err)
	}
	fromItem, err := queries.ProjectIDForItemDefinition(ctx, mustUUID(itemID))
	if err != nil || fromItem.String() != project.ID {
		t.Fatalf("ProjectIDForItemDefinition = %v, %v", fromItem, err)
	}
	fromThreat, err := queries.ProjectIDForThreatScenario(ctx, mustUUID(threatID))
	if err != nil || fromThreat.String() != project.ID {
		t.Fatalf("ProjectIDForThreatScenario = %v, %v", fromThreat, err)
	}

	// One role per user and project. Runs last: the unique violation aborts the test transaction.
	call(bob, http.MethodPost, members, `{"email":"new@example.com","role":"EDITOR"}`, http.StatusConflict)
}
