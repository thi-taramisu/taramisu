package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const projectID = "11111111-1111-1111-1111-111111111111"

type fakeProjects struct {
	handlers.AssetStore
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore
	statusReaderFunc
	project   db.TaraProject
	found     bool
	deleteErr error
}

func newFakeProjects(found bool) *fakeProjects {
	var id pgtype.UUID
	_ = id.Scan(projectID)
	desc := "desc"
	return &fakeProjects{
		found: found,
		project: db.TaraProject{
			ID:          id,
			Name:        "proj",
			Description: &desc,
			CreatedAt:   pgtype.Timestamptz{Time: time.Unix(0, 0).UTC(), Valid: true},
		},
	}
}

func (f *fakeProjects) CreateTaraProject(_ context.Context, a db.CreateTaraProjectParams) (db.TaraProject, error) {
	p := f.project
	p.Name, p.Description = a.Name, a.Description
	return p, nil
}

func (f *fakeProjects) GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	return f.project, nil
}

func (f *fakeProjects) ListTaraProjects(context.Context) ([]db.TaraProject, error) {
	if !f.found {
		return nil, nil
	}
	return []db.TaraProject{f.project}, nil
}

func (f *fakeProjects) ReplaceTaraProject(_ context.Context, a db.ReplaceTaraProjectParams) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	p := f.project
	p.Name, p.Description = a.Name, a.Description
	return p, nil
}

func (f *fakeProjects) UpdateTaraProject(_ context.Context, a db.UpdateTaraProjectParams) (db.TaraProject, error) {
	if !f.found {
		return db.TaraProject{}, pgx.ErrNoRows
	}
	p := f.project
	if a.Name != nil {
		p.Name = *a.Name
	}
	if a.SetDescription {
		p.Description = a.Description
	}
	return p, nil
}

func (f *fakeProjects) DeleteTaraProject(context.Context, pgtype.UUID) (int64, error) {
	if f.deleteErr != nil {
		return 0, f.deleteErr
	}
	if !f.found {
		return 0, nil
	}
	return 1, nil
}

func TestTaraProjectRoutes(t *testing.T) {
	base := "/api/v1/projects"
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name   string
		found  bool
		method string
		path   string
		body   string
		code   int
	}{
		{"create", true, http.MethodPost, base, `{"name":"a"}`, http.StatusCreated},
		{"create empty name", true, http.MethodPost, base, `{"name":""}`, http.StatusUnprocessableEntity},
		{"create whitespace name", true, http.MethodPost, base, `{"name":"   "}`, http.StatusUnprocessableEntity},
		{"list", true, http.MethodGet, base, "", http.StatusOK},
		{"list empty", false, http.MethodGet, base, "", http.StatusOK},
		{"get", true, http.MethodGet, base + "/" + projectID, "", http.StatusOK},
		{"get missing", false, http.MethodGet, base + "/" + projectID, "", http.StatusNotFound},
		{"get bad id", true, http.MethodGet, base + "/nope", "", http.StatusUnprocessableEntity},
		{"replace", true, http.MethodPut, base + "/" + projectID, `{"name":"b"}`, http.StatusOK},
		{"replace missing", false, http.MethodPut, base + "/" + projectID, `{"name":"b"}`, http.StatusNotFound},
		{"replace whitespace name", true, http.MethodPut, base + "/" + projectID, `{"name":" "}`, http.StatusUnprocessableEntity},
		{"update", true, http.MethodPatch, base + "/" + projectID, `{"name":"c"}`, http.StatusOK},
		{"update whitespace name", true, http.MethodPatch, base + "/" + projectID, `{"name":"\t"}`, http.StatusUnprocessableEntity},
		{"update missing", false, http.MethodPatch, base + "/" + projectID, `{"name":"c"}`, http.StatusNotFound},
		{"delete", true, http.MethodDelete, base + "/" + projectID, "", http.StatusNoContent},
		{"delete missing", false, http.MethodDelete, base + "/" + projectID, "", http.StatusNotFound},
	} {
		t.Run(tc.name, func(t *testing.T) {
			h := httpapi.New(newFakeProjects(tc.found), manager)
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			h.ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
		})
	}
}

func TestTaraProjectDeleteWithItemDefinitions(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	store := newFakeProjects(true)
	store.deleteErr = &pgconn.PgError{Code: "23503"}
	req := httptest.NewRequest(http.MethodDelete, "/api/v1/projects/"+projectID, http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(store, manager).ServeHTTP(rr, req)
	if rr.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d: %s", rr.Code, http.StatusConflict, rr.Body.String())
	}
}

func TestTaraProjectListBody(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects", http.NoBody)
	req.Header.Set("Authorization", bearer)
	rr := httptest.NewRecorder()
	httpapi.New(newFakeProjects(false), manager).ServeHTTP(rr, req)
	var got []any
	if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil || got == nil || len(got) != 0 {
		t.Fatalf("body = %s, want []", rr.Body.String())
	}
}

func TestTaraProjectPatchDescription(t *testing.T) {
	manager, bearer := authtest.NewManagerAndToken(t)
	for _, tc := range []struct {
		name string
		body string
		want any
	}{
		{"omitted keeps description", `{"name":"c"}`, "desc"},
		{"null clears description", `{"description":null}`, nil},
		{"value replaces description", `{"description":"new"}`, "new"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPatch, "/api/v1/projects/"+projectID, strings.NewReader(tc.body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", bearer)
			rr := httptest.NewRecorder()
			httpapi.New(newFakeProjects(true), manager).ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("status = %d: %s", rr.Code, rr.Body.String())
			}
			var got map[string]any
			if err := json.Unmarshal(rr.Body.Bytes(), &got); err != nil {
				t.Fatal(err)
			}
			if got["description"] != tc.want {
				t.Fatalf("description = %v, want %v: %s", got["description"], tc.want, rr.Body.String())
			}
		})
	}
}
