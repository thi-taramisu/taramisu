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

func TestTaraProjectPostgresCRUD(t *testing.T) {
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
	// Use the database as user store: creating a project assigns the caller as Owner,
	// which needs a real iam_user row.
	fixture := authtest.NewFixture(t, db.New(tx))
	bearer := "Bearer " + fixture.Token(t, nil)
	handler := httpapi.New(db.NewStore(tx), fixture.Manager)
	call := func(method, path, body string, want int) handlers.TaraProjectBody {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", bearer)
		rr := httptest.NewRecorder()
		handler.ServeHTTP(rr, req)
		if rr.Code != want {
			t.Fatalf("%s %s: status = %d, want %d: %s", method, path, rr.Code, want, rr.Body.String())
		}
		var project handlers.TaraProjectBody
		if want == http.StatusOK || want == http.StatusCreated {
			if err := json.Unmarshal(rr.Body.Bytes(), &project); err != nil {
				t.Fatal(err)
			}
		}
		return project
	}
	const collection = "/api/v1/projects"

	project := call(http.MethodPost, collection, `{"name":"Headlamp","description":"original"}`, http.StatusCreated)
	if project.ID == "" || project.CreatedAt.IsZero() || project.Description == nil || *project.Description != "original" {
		t.Fatalf("create did not return generated fields: %+v", project)
	}
	path := collection + "/" + project.ID

	if got := call(http.MethodGet, path, "", http.StatusOK); got.Name != "Headlamp" {
		t.Fatalf("get returned %+v", got)
	}

	if got := call(http.MethodPatch, path, `{"name":"Renamed"}`, http.StatusOK); got.Name != "Renamed" || got.Description == nil || *got.Description != "original" {
		t.Fatalf("omitted description must be kept: %+v", got)
	}
	if got := call(http.MethodPatch, path, `{"description":null}`, http.StatusOK); got.Name != "Renamed" || got.Description != nil {
		t.Fatalf("null must clear the description: %+v", got)
	}
	if got := call(http.MethodPatch, path, `{"description":"again"}`, http.StatusOK); got.Description == nil || *got.Description != "again" {
		t.Fatalf("value must set the description: %+v", got)
	}

	if got := call(http.MethodPut, path, `{"name":"Replaced"}`, http.StatusOK); got.Name != "Replaced" || got.Description != nil || !got.CreatedAt.Equal(project.CreatedAt) {
		t.Fatalf("put must clear omitted fields and keep created_at: %+v", got)
	}

	req := httptest.NewRequest(http.MethodGet, collection, http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)
	var list []handlers.TaraProjectBody
	if err := json.Unmarshal(rr.Body.Bytes(), &list); err != nil || rr.Code != http.StatusOK {
		t.Fatalf("list: %d %s", rr.Code, rr.Body.String())
	}
	found := false
	for _, p := range list {
		found = found || p.ID == project.ID
	}
	if !found {
		t.Fatalf("created project missing from list: %s", rr.Body.String())
	}

	call(http.MethodDelete, path, "", http.StatusNoContent)
	call(http.MethodGet, path, "", http.StatusNotFound)
}
