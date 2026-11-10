package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

// Embed unused interfaces to satisfy the router without replacing its registration.
type propertyQueries struct {
	handlers.RiskValueStore
	handlers.RiskTreatmentDecisionStore

	resourceAccess
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.TaraProjectStore
	*propertyErrorStore
	handlers.StatusReader
	handlers.AssetStore
}

// routeAPI sends authenticated HTTP requests through the production router.
type routeAPI struct {
	t       *testing.T
	handler http.Handler
	token   string
}

func newRouteAPI(t *testing.T, queries httpapi.Queries) *routeAPI {
	t.Helper()
	manager, token := authtest.NewManagerAndToken(t)
	return &routeAPI{t: t, handler: httpapi.New(queries, manager), token: token}
}

func (a *routeAPI) Do(method, path string, bodies ...any) *httptest.ResponseRecorder {
	a.t.Helper()
	var body io.Reader = http.NoBody
	if len(bodies) > 0 {
		if reader, ok := bodies[0].(io.Reader); ok {
			body = reader
		} else {
			data, err := json.Marshal(bodies[0])
			if err != nil {
				a.t.Fatal(err)
			}
			body = bytes.NewReader(data)
		}
	}
	r := httptest.NewRequest(method, path, body)
	r.Header.Set("Content-Type", "application/json")
	if a.token != "" {
		r.Header.Set("Authorization", a.token)
	}
	w := httptest.NewRecorder()
	a.handler.ServeHTTP(w, r)
	return w
}

func (a *routeAPI) Get(path string) *httptest.ResponseRecorder { return a.Do(http.MethodGet, path) }
func (a *routeAPI) Post(path string, body any) *httptest.ResponseRecorder {
	return a.Do(http.MethodPost, path, body)
}
func (a *routeAPI) Put(path string, body any) *httptest.ResponseRecorder {
	return a.Do(http.MethodPut, path, body)
}
func (a *routeAPI) Patch(path string, body any) *httptest.ResponseRecorder {
	return a.Do(http.MethodPatch, path, body)
}
func (a *routeAPI) Delete(path string) *httptest.ResponseRecorder {
	return a.Do(http.MethodDelete, path)
}

func TestResourceRoutesRequireBearerToken(t *testing.T) {
	api := newRouteAPI(t, nil)
	api.token = ""
	routes := append(propertyRouteCases(), propertyRouteCase{"asset", assetCollection, assetPath, assetJSON})
	for _, route := range routes {
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE", "LIST"} {
			t.Run(route.name+"/"+method, func(t *testing.T) {
				path, verb := route.member, method
				if method == "POST" || method == "LIST" {
					path = route.collection
				}
				if method == "LIST" {
					verb = http.MethodGet
				}
				if r := api.Do(verb, path, bytes.NewBufferString(route.body)); r.Code != http.StatusUnauthorized {
					t.Fatalf("got %d, want 401: %s", r.Code, r.Body)
				}
			})
		}
	}
}

// resourceAccess supplies the shared project check independently from resource-storage errors.
type resourceAccess struct {
	handlers.ProjectAccessStore
	role        db.ProjectRole
	nonMember   bool
	missingItem bool
}

func (a resourceAccess) GetProjectRole(context.Context, db.GetProjectRoleParams) (db.ProjectRole, error) {
	if a.nonMember {
		return "", pgx.ErrNoRows
	}
	if a.role == "" {
		return db.ProjectRoleEDITOR, nil
	}
	return a.role, nil
}

func (a resourceAccess) ProjectIDForItemDefinition(context.Context, pgtype.UUID) (pgtype.UUID, error) {
	if a.missingItem {
		return pgtype.UUID{}, pgx.ErrNoRows
	}
	return mustUUID("aaaaaaaa-0000-4000-8000-000000000100"), nil
}

func TestResourceProjectPermissions(t *testing.T) {
	routes := append(propertyRouteCases(), propertyRouteCase{"asset", assetCollection, assetPath, assetJSON})
	for _, access := range []struct {
		name  string
		value resourceAccess
	}{
		{"non-member", resourceAccess{nonMember: true}},
		{"missing item", resourceAccess{missingItem: true}},
		{"viewer", resourceAccess{role: db.ProjectRoleVIEWER}},
		{"editor", resourceAccess{role: db.ProjectRoleEDITOR}},
		{"owner", resourceAccess{role: db.ProjectRoleOWNER}},
	} {
		for _, route := range routes {
			t.Run(access.name+"/"+route.name, func(t *testing.T) {
				var queries httpapi.Queries
				var calls *int
				if route.name == "asset" {
					store := &assetStore{resourceAccess: access.value}
					queries, calls = store, &store.calls
				} else {
					store := &propertyErrorStore{}
					queries, calls = propertyQueries{resourceAccess: access.value, propertyErrorStore: store}, &store.calls
				}
				api := newRouteAPI(t, queries)
				for _, operation := range []struct {
					method, path string
					success      int
				}{
					{"GET", route.collection, 200}, {"GET", route.member, 200},
					{"POST", route.collection, 201}, {"PUT", route.member, 200},
					{"PATCH", route.member, 200}, {"DELETE", route.member, 204},
				} {
					want := operation.success
					if access.value.nonMember || access.value.missingItem {
						want = 404
					} else if access.value.role == db.ProjectRoleVIEWER && operation.method != "GET" {
						want = 403
					}
					before := *calls
					response := api.Do(operation.method, operation.path, strings.NewReader(route.body))
					if response.Code != want {
						t.Errorf("%s %s: got %d, want %d: %s", operation.method, operation.path, response.Code, want, response.Body)
					}
					if want >= 400 && *calls != before {
						t.Fatal("denied request reached resource storage")
					}
				}
			})
		}
	}
}

func TestResourceOpenAPIPermissions(t *testing.T) {
	spec := httpapi.OpenAPI()
	for path, item := range spec.Paths {
		if !strings.HasPrefix(path, "/api/v1/item-definitions/") {
			continue
		}
		for method, operation := range map[string]*huma.Operation{"GET": item.Get, "POST": item.Post, "PUT": item.Put, "PATCH": item.Patch, "DELETE": item.Delete} {
			if operation == nil {
				continue
			}
			want := "edit"
			if method == "GET" {
				want = "read"
			}
			if operation.Extensions["x-taramisu-permission"] != want {
				t.Errorf("%s %s: wrong permission: %+v", method, path, operation.Extensions)
			}
			if operation.Responses["403"] == nil {
				t.Errorf("%s %s: missing forbidden response", method, path)
			}
		}
	}
}
