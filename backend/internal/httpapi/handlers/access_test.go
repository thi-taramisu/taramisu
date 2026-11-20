package handlers_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const (
	knownItemID   = "dddddddd-0000-4000-8000-000000000001"
	brokenItemID  = "dddddddd-0000-4000-8000-0000000000ff"
	knownThreatID = "eeeeeeee-0000-4000-8000-000000000001"
)

// fakeAccess gives the caller role in projectID, which owns knownItemID and knownThreatID.
type fakeAccess struct{ role db.ProjectRole }

func (f fakeAccess) GetProjectRole(_ context.Context, a db.GetProjectRoleParams) (db.ProjectRole, error) {
	if f.role == "" || a.ProjectID != mustUUID(projectID) {
		return "", pgx.ErrNoRows
	}
	return f.role, nil
}

func (fakeAccess) ProjectIDForItemDefinition(_ context.Context, id pgtype.UUID) (pgtype.UUID, error) {
	switch id {
	case mustUUID(knownItemID):
		return mustUUID(projectID), nil
	case mustUUID(brokenItemID):
		return pgtype.UUID{}, errors.New("database down")
	}
	return pgtype.UUID{}, pgx.ErrNoRows
}

func (fakeAccess) ProjectIDForThreatScenario(_ context.Context, id pgtype.UUID) (pgtype.UUID, error) {
	if id == mustUUID(knownThreatID) {
		return mustUUID(projectID), nil
	}
	return pgtype.UUID{}, pgx.ErrNoRows
}

type roleOutput struct {
	Body struct {
		Role db.ProjectRole `json:"role"`
	}
}

// echoRole is a handler that reports the role the access check put into the context.
func echoRole(ctx context.Context, _ *struct{}) (*roleOutput, error) {
	out := &roleOutput{}
	out.Body.Role = handlers.RoleFromContext(ctx)
	return out, nil
}

func newAccessAPI(t *testing.T, store handlers.ProjectAccessStore) (http.Handler, huma.API, string) {
	t.Helper()
	fixture := authtest.NewFixture(t, nil)
	mux := chi.NewRouter()
	mux.Use(fixture.Manager.Require)
	api := humachi.New(mux, huma.DefaultConfig("test", "1.0.0"))
	op := func(id, method, path string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path}
	}
	handlers.Register(api, op("read-item", http.MethodGet, "/api/v1/item-definitions/{item_definition_id}/things"),
		handlers.InProject(store, handlers.ScopeItemDefinition, handlers.PermRead), echoRole)
	handlers.Register(api, op("edit-item", http.MethodPost, "/api/v1/item-definitions/{item_definition_id}/things"),
		handlers.InProject(store, handlers.ScopeItemDefinition, handlers.PermEdit), echoRole)
	handlers.Register(api, op("read-threat", http.MethodGet, "/api/v1/threat-scenarios/{threat_scenario_id}/things"),
		handlers.InProject(store, handlers.ScopeThreatScenario, handlers.PermRead), echoRole)
	handlers.Register(api, op("manage-project", http.MethodDelete, "/api/v1/things/{project_id}"),
		handlers.InProject(store, handlers.ScopeProject("project_id"), handlers.PermManage), echoRole)
	return mux, api, "Bearer " + fixture.Token(t, nil)
}

func TestProjectAccessCheck(t *testing.T) {
	items := "/api/v1/item-definitions/"
	for _, tc := range []struct {
		name, method, path string
		role               db.ProjectRole
		bearer             bool
		code               int
	}{
		{"read below item", http.MethodGet, items + knownItemID + "/things", db.ProjectRoleVIEWER, true, http.StatusOK},
		{"edit as viewer", http.MethodPost, items + knownItemID + "/things", db.ProjectRoleVIEWER, true, http.StatusForbidden},
		{"edit as editor", http.MethodPost, items + knownItemID + "/things", db.ProjectRoleEDITOR, true, http.StatusOK},
		{"no role", http.MethodGet, items + knownItemID + "/things", "", true, http.StatusNotFound},
		{"unknown item", http.MethodGet, items + newMemberID + "/things", db.ProjectRoleOWNER, true, http.StatusNotFound},
		{"malformed id", http.MethodGet, items + "not-a-uuid/things", db.ProjectRoleOWNER, true, http.StatusUnprocessableEntity},
		{"database error", http.MethodGet, items + brokenItemID + "/things", db.ProjectRoleOWNER, true, http.StatusInternalServerError},
		{"read below threat", http.MethodGet, "/api/v1/threat-scenarios/" + knownThreatID + "/things", db.ProjectRoleVIEWER, true, http.StatusOK},
		{"manage as editor", http.MethodDelete, "/api/v1/things/" + projectID, db.ProjectRoleEDITOR, true, http.StatusForbidden},
		{"manage as owner", http.MethodDelete, "/api/v1/things/" + projectID, db.ProjectRoleOWNER, true, http.StatusOK},
		{"no token", http.MethodGet, items + knownItemID + "/things", db.ProjectRoleOWNER, false, http.StatusUnauthorized},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler, _, bearer := newAccessAPI(t, fakeAccess{role: tc.role})
			req := httptest.NewRequest(tc.method, tc.path, http.NoBody)
			if tc.bearer {
				req.Header.Set("Authorization", bearer)
			}
			rr := httptest.NewRecorder()
			handler.ServeHTTP(rr, req)
			if rr.Code != tc.code {
				t.Fatalf("status = %d, want %d: %s", rr.Code, tc.code, rr.Body.String())
			}
			if tc.code == http.StatusOK && !strings.Contains(rr.Body.String(), string(tc.role)) {
				t.Fatalf("handler did not get the role %s from the context: %s", tc.role, rr.Body.String())
			}
		})
	}
}

func TestProjectAccessIsDeclaredInOpenAPI(t *testing.T) {
	_, api, _ := newAccessAPI(t, fakeAccess{})
	op := api.OpenAPI().Paths["/api/v1/item-definitions/{item_definition_id}/things"].Post
	if op.Extensions["x-taramisu-permission"] != "edit" || op.Responses["403"] == nil || op.Responses["404"] == nil {
		t.Fatalf("edit operation: extensions %v, responses %v", op.Extensions, op.Responses)
	}
	if err := handlers.CheckAccessDeclared(api.OpenAPI()); err != nil {
		t.Fatalf("all test operations are declared: %v", err)
	}
}

func TestCheckAccessDeclaredRejectsUndeclaredOperations(t *testing.T) {
	_, api, _ := newAccessAPI(t, fakeAccess{})
	huma.Get(api, "/api/v1/forgotten/{id}", echoRole)
	huma.Head(api, "/api/v1/forgotten-head", func(context.Context, *struct{}) (*struct{}, error) { return nil, nil })
	huma.Get(api, "/health/other", echoRole) // outside /api/, not checked
	err := handlers.CheckAccessDeclared(api.OpenAPI())
	if err == nil || !strings.Contains(err.Error(), "GET /api/v1/forgotten/{id}") || !strings.Contains(err.Error(), "HEAD /api/v1/forgotten-head") ||
		strings.Contains(err.Error(), "health") {
		t.Fatalf("CheckAccessDeclared = %v, want an error naming only the forgotten operation", err)
	}
}

func TestRegisterRejectsScopeWithoutPathParameter(t *testing.T) {
	_, api, _ := newAccessAPI(t, fakeAccess{})
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic for a scope whose parameter is not in the path")
		}
	}()
	handlers.Register(api, huma.Operation{OperationID: "wrong-scope", Method: http.MethodGet, Path: "/api/v1/projects/{id}/x"},
		handlers.InProject(fakeAccess{}, handlers.ScopeItemDefinition, handlers.PermRead), echoRole)
}

func TestRegisterRejectsWithoutProjectOnProjectPaths(t *testing.T) {
	for _, path := range []string{
		"/api/v1/projects/{id}/export",
		"/api/v1/item-definitions/{item_definition_id}/assets",
		"/api/v1/threat-scenarios/{threat_scenario_id}/risk-values",
		"/api/v1/other/{project_id}",
	} {
		t.Run(path, func(t *testing.T) {
			_, api, _ := newAccessAPI(t, fakeAccess{})
			defer func() {
				if recover() == nil {
					t.Fatal("expected a panic for WithoutProject on a project path")
				}
			}()
			handlers.Register(api, huma.Operation{OperationID: "skip-check", Method: http.MethodGet, Path: path},
				handlers.WithoutProject(), echoRole)
		})
	}
	// Paths outside a project stay allowed.
	_, api, _ := newAccessAPI(t, fakeAccess{})
	handlers.Register(api, huma.Operation{OperationID: "list", Method: http.MethodGet, Path: "/api/v1/projects"},
		handlers.WithoutProject(), echoRole)
}
