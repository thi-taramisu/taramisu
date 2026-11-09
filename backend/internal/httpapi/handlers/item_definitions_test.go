package handlers_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const itemProjectID = "11111111-1111-4111-8111-111111111111"
const itemDefinitionID = "22222222-2222-4222-8222-222222222222"
const itemUserID = "33333333-3333-4333-8333-333333333333"
const itemCollection = "/api/v1/projects/" + itemProjectID + "/item-definitions"
const itemMember = itemCollection + "/" + itemDefinitionID

type itemStore struct {
	handlers.TaraProjectStore
	handlers.ProjectAccessStore
	handlers.ProjectMemberStore
	handlers.AssetStore
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore
	handlers.StatusReader
	role    db.ProjectRole
	err     error
	calls   int
	access  db.GetProjectRoleParams
	patch   db.PatchItemDefinitionParams
	replace db.ReplaceItemDefinitionParams
	row     db.ItemDefinition
	count   int64
}

func newItemStore() *itemStore {
	var project, item pgtype.UUID
	if err := project.Scan(itemProjectID); err != nil {
		panic(err)
	}
	if err := item.Scan(itemDefinitionID); err != nil {
		panic(err)
	}
	return &itemStore{role: db.ProjectRoleEDITOR, count: 1, row: db.ItemDefinition{ID: item, TaraProjectID: project, Name: "Headlamp", ScopeType: db.ScopeTypeITEM, CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}}}
}
func (*itemStore) UpsertIAMUser(context.Context, string) (string, error) { return itemUserID, nil }
func (s *itemStore) GetProjectRole(_ context.Context, p db.GetProjectRoleParams) (db.ProjectRole, error) {
	s.access = p
	if s.role == "" {
		return "", pgx.ErrNoRows
	}
	return s.role, nil
}
func (s *itemStore) ListItemDefinitions(context.Context, db.ListItemDefinitionsParams) ([]db.ItemDefinition, error) {
	s.calls++
	return nil, s.err
}
func (s *itemStore) GetItemDefinition(_ context.Context, p db.GetItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	if p.ProjectID != s.row.TaraProjectID || p.ID != s.row.ID {
		return db.ItemDefinition{}, pgx.ErrNoRows
	}
	return s.row, s.err
}
func (s *itemStore) CreateItemDefinition(_ context.Context, p db.CreateItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.row.Name = p.Name
	s.row.ScopeType = p.ScopeType
	return s.row, s.err
}
func (s *itemStore) ReplaceItemDefinition(_ context.Context, p db.ReplaceItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.replace = p
	return s.row, s.err
}
func (s *itemStore) PatchItemDefinition(_ context.Context, p db.PatchItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.patch = p
	return s.row, s.err
}
func (s *itemStore) DeleteItemDefinition(context.Context, db.DeleteItemDefinitionParams) (int64, error) {
	s.calls++
	return s.count, s.err
}

// Authenticate through the same Bearer JWT middleware used by the protected API.
func authenticatedAPI(t *testing.T, store httpapi.Queries, users auth.UserStore) (http.Handler, *string) {
	t.Helper()
	fixture := authtest.NewFixture(t, users)
	token := "Bearer " + fixture.Token(t, nil)
	return httpapi.New(store, fixture.Manager), &token
}

func request(handler http.Handler, method, path, body string, token *string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	if token != nil {
		r.Header.Set("Authorization", *token)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestItemDefinitionRoutes(t *testing.T) {
	store := newItemStore()
	handler, token := authenticatedAPI(t, store, store)
	for _, tc := range []struct {
		method, path, body string
		code               int
	}{
		{"POST", itemCollection, `{"name":"Headlamp","scope_type":"ITEM"}`, 201},
		{"GET", itemMember, "", 200},
		{"GET", itemCollection, "", 200},
		{"PUT", itemMember, `{"name":"Replacement","scope_type":"COMPONENT"}`, 200},
		{"PATCH", itemMember, `{"name":"Updated","lifecycle_phase":null,"architectural_design":"diagram"}`, 200},
		{"DELETE", itemMember, "", 204},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			unauthorized := request(handler, tc.method, tc.path, tc.body, nil)
			if unauthorized.Code != 401 {
				t.Fatalf("unauthenticated: %d", unauthorized.Code)
			}
			w := request(handler, tc.method, tc.path, tc.body, token)
			if w.Code != tc.code {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			if store.access.ProjectID.String() != itemProjectID || store.access.UserID.String() != itemUserID {
				t.Fatalf("wrong access check: %+v", store.access)
			}
			if tc.method == "POST" && w.Header().Get("Location") != itemMember {
				t.Fatalf("Location: %s", w.Header().Get("Location"))
			}
			if tc.method == "GET" && tc.path == itemCollection && strings.TrimSpace(w.Body.String()) != "[]" {
				t.Fatalf("empty itemCollection: %s", w.Body.String())
			}
			if tc.method == "PUT" && store.replace.LifecyclePhase != nil {
				t.Fatal("replacement retained omitted optional field")
			}
			if tc.method == "PATCH" {
				p := store.patch
				if !p.SetLifecyclePhase || p.LifecyclePhase != nil || p.SetItemDefinition || p.SetCybersecuritySpecs || !p.SetArchitecturalDesign || p.ArchitecturalDesign == nil || *p.ArchitecturalDesign != "diagram" || p.Name == nil || *p.Name != "Updated" || p.ScopeType != nil {
					t.Fatalf("incorrect patch presence/null handling: %+v", p)
				}
			}
		})
	}
}

func TestItemDefinitionValidationAndErrors(t *testing.T) {
	store := newItemStore()
	handler, token := authenticatedAPI(t, store, store)
	for _, tc := range []struct{ method, path, body string }{
		{"POST", itemCollection, `{"name":"","scope_type":"ITEM"}`},
		{"POST", itemCollection, `{"name":"   ","scope_type":"ITEM"}`},
		{"POST", itemCollection, `{"name":"A","scope_type":"INVALID"}`},
		{"POST", itemCollection, `{"name":"A"}`},
		{"PUT", itemMember, `{"scope_type":"ITEM"}`},
		{"PATCH", itemMember, `{"name":null}`},
		{"PATCH", itemMember, `{"scope_type":null}`},
		{"PATCH", itemMember, `{"scope_type":"INVALID"}`},
		{"PATCH", itemMember, `{"lifecycle_phase":123}`},
		{"PATCH", itemMember, `{"unknown":"field"}`},
		{"GET", itemCollection + "?limit=101", ""},
		{"GET", itemCollection + "?offset=-1", ""},
		{"GET", itemCollection + "/not-a-uuid", ""},
		{"GET", "/api/v1/projects/invalid/item-definitions", ""},
	} {
		w := request(handler, tc.method, tc.path, tc.body, token)
		if w.Code != 422 {
			t.Errorf("%s %s %s: got %d %s", tc.method, tc.path, tc.body, w.Code, w.Body.String())
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid request reached storage")
	}
	store.role = ""
	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		path, body := itemMember, `{"name":"A","scope_type":"ITEM"}`
		if method == "POST" {
			path = itemCollection
		}
		w := request(handler, method, path, body, token)
		if w.Code != 404 {
			t.Errorf("inaccessible project %s: %d", method, w.Code)
		}
	}
	if store.calls != 0 {
		t.Fatal("unauthorized request reached storage")
	}
	store.role = db.ProjectRoleEDITOR
	for _, tc := range []struct {
		err  error
		code int
	}{
		{pgx.ErrNoRows, 404},
		{&pgconn.PgError{Code: "23503"}, 409},
		{errors.New("private database details"), 500},
	} {
		store.err = tc.err
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
			path := itemMember
			if method == "POST" {
				path = itemCollection
			}
			w := request(handler, method, path, `{"name":"A","scope_type":"ITEM"}`, token)
			if w.Code != tc.code || strings.Contains(w.Body.String(), "private database details") {
				t.Errorf("%s error: %d %s", method, w.Code, w.Body.String())
			}
		}
	}
	store.err = nil
	store.count = 0
	if w := request(handler, "DELETE", itemMember, "", token); w.Code != 404 {
		t.Fatalf("missing delete: %d", w.Code)
	}
}

func TestItemDefinitionOpenAPI(t *testing.T) {
	spec := httpapi.OpenAPI()
	for path, methods := range map[string][]string{
		"/api/v1/projects/{project_id}/item-definitions":           {"GET", "POST"},
		"/api/v1/projects/{project_id}/item-definitions/{item_id}": {"GET", "PUT", "PATCH", "DELETE"},
	} {
		item := spec.Paths[path]
		if item == nil {
			t.Fatalf("missing path %s", path)
		}
		for _, method := range methods {
			var operation *huma.Operation
			switch method {
			case "GET":
				operation = item.Get
			case "POST":
				operation = item.Post
			case "PUT":
				operation = item.Put
			case "PATCH":
				operation = item.Patch
			case "DELETE":
				operation = item.Delete
			}
			want := "edit"
			if method == http.MethodGet {
				want = "read"
			}
			if operation.Extensions["x-taramisu-permission"] != want {
				t.Errorf("wrong project permission: %s %s: %+v", method, path, operation.Extensions)
			}
			if len(operation.Security) != 1 || operation.Security[0]["bearer"] == nil {
				t.Errorf("missing Bearer JWT authentication: %s %s", method, path)
			}
		}
	}
}

func TestItemDefinitionPermissions(t *testing.T) {
	store := newItemStore()
	handler, token := authenticatedAPI(t, store, store)
	for _, role := range []db.ProjectRole{"", db.ProjectRoleVIEWER, db.ProjectRoleEDITOR, db.ProjectRoleOWNER} {
		store.role = role
		for _, route := range []struct {
			method, path string
			success      int
		}{
			{"GET", itemCollection, 200}, {"GET", itemMember, 200},
			{"POST", itemCollection, 201}, {"PUT", itemMember, 200},
			{"PATCH", itemMember, 200}, {"DELETE", itemMember, 204},
		} {
			want := route.success
			if role == "" {
				want = 404
			} else if role == db.ProjectRoleVIEWER && route.method != "GET" {
				want = 403
			}
			before := store.calls
			w := request(handler, route.method, route.path, `{"name":"Item","scope_type":"ITEM"}`, token)
			if w.Code != want {
				t.Errorf("%s %s %s: got %d, want %d: %s", role, route.method, route.path, w.Code, want, w.Body.String())
			}
			if want >= 400 && store.calls != before {
				t.Fatal("denied request reached storage")
			}
		}
	}
}
