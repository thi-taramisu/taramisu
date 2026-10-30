package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

type testUsers struct{}

func (testUsers) UpsertIAMUser(context.Context, string) (string, error) {
	return "", errors.New("unexpected user lookup")
}

func TestAuthRoutes(t *testing.T) {
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 "http://" + r.Host,
			"authorization_endpoint": "http://" + r.Host + "/authorize",
		}); err != nil {
			t.Error(err)
		}
	}))
	defer provider.Close()
	manager, err := auth.New(context.Background(), auth.Config{
		Issuer: provider.URL, ClientID: "taramisu", ClientSecret: "secret", AppURL: "http://localhost:8080",
	}, testUsers{})
	if err != nil {
		t.Fatal(err)
	}
	handler := New(nil, manager)
	for path, want := range map[string]int{
		"/health/live": 200, "/openapi.json": 200,
		"/api/v1/me": 401, "/api/v1/unknown": 401,
		"/auth/login": 302, "/auth/callback": 400, "/auth/logout": 405,
	} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, http.NoBody))
		if w.Code != want {
			t.Fatalf("GET %s: got %d, want %d", path, w.Code, want)
		}
		if path == "/api/v1/me" {
			var problem huma.ErrorModel
			decoder := json.NewDecoder(w.Body)
			decoder.DisallowUnknownFields()
			if err := decoder.Decode(&problem); err != nil {
				t.Fatal(err)
			}
			if got := w.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Fatalf("Content-Type = %q, want application/problem+json", got)
			}
		}
	}
	// Every asset operation must be rejected before it can touch the database.
	for _, route := range []struct{ method, path string }{
		{http.MethodGet, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets"},
		{http.MethodPost, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets"},
		{http.MethodGet, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000001"},
		{http.MethodPut, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000001"},
		{http.MethodPatch, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000001"},
		{http.MethodDelete, "/api/v1/item-definitions/00000000-0000-4000-8000-000000000002/assets/00000000-0000-4000-8000-000000000001"},
	} {
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, httptest.NewRequest(route.method, route.path, http.NoBody))
		if w.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s: got %d", route.method, route.path, w.Code)
		}
	}
	for origin, want := range map[string]int{"": 403, "http://localhost:8080": 204} {
		r := httptest.NewRequest(http.MethodPost, "/auth/logout", http.NoBody)
		r.Header.Set("Origin", origin)
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("POST /auth/logout with origin %q: got %d, want %d", origin, w.Code, want)
		}
	}
	if op := OpenAPI().Paths["/api/v1/me"].Get; len(op.Security) == 0 {
		t.Fatal("OpenAPI does not document session authentication")
	}
	w := httptest.NewRecorder()
	New(nil, nil).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/me", http.NoBody))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing auth configuration: %d", w.Code)
	}
}

func TestAuthOpenAPI(t *testing.T) {
	spec := OpenAPI()
	for _, path := range []string{"/auth/login", "/auth/callback", "/auth/logout"} {
		item := spec.Paths[path]
		if item == nil || (path == "/auth/logout" && item.Post == nil) || (path != "/auth/logout" && item.Get == nil) {
			t.Errorf("missing auth operation: %s", path)
		}
	}
}

func TestAssetOpenAPI(t *testing.T) {
	spec := OpenAPI()
	collection := spec.Paths["/api/v1/item-definitions/{item_definition_id}/assets"]
	resource := spec.Paths["/api/v1/item-definitions/{item_definition_id}/assets/{id}"]
	if collection == nil || resource == nil {
		t.Fatal("missing asset paths")
	}
	for _, op := range []*huma.Operation{collection.Get, collection.Post, resource.Get, resource.Put, resource.Patch, resource.Delete} {
		if op == nil || len(op.Security) != 1 {
			t.Fatal("missing asset operation or security")
		}
		if _, ok := op.Security[0]["session"]; !ok {
			t.Fatal("missing session security")
		}
	}
	if collection.Post.Responses["201"] == nil || resource.Delete.Responses["204"] == nil {
		t.Fatal("incorrect CRUD status codes")
	}
}

func TestAssetNullableEnumContract(t *testing.T) {
	for _, name := range []string{"Asset", "AssetBody", "UpdateAssetInputBody"} {
		t.Run(name, func(t *testing.T) {
			data, err := json.Marshal(OpenAPI().Components.Schemas.Map()[name])
			if err != nil {
				t.Fatal(err)
			}
			// Decode only the field under test; other properties have scalar types.
			var object struct {
				Properties map[string]json.RawMessage `json:"properties"`
			}
			if err := json.Unmarshal(data, &object); err != nil {
				t.Fatal(err)
			}
			var field struct {
				Type []string `json:"type"`
				Enum []any    `json:"enum"`
			}
			if err := json.Unmarshal(object.Properties["identification_source"], &field); err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(field.Type, []string{"string", "null"}) ||
				!reflect.DeepEqual(field.Enum, []any{"ITEM_DEF", "IMPACT_RATING", "THREAT_DERIVED", "CATALOGUE", nil}) {
				t.Fatalf("invalid nullable enum contract: %+v", field)
			}
		})
	}
}
