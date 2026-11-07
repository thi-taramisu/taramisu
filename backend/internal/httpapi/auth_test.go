package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
)

func TestAuthRoutes(t *testing.T) {
	manager, bearerToken := authtest.NewManagerAndToken(t)
	handler := New(nil, manager)

	for path, want := range map[string]int{
		"/health/live":  http.StatusOK,
		"/openapi.json": http.StatusOK,
		"/api/v1/me":    http.StatusUnauthorized,
		"/api/v1/other": http.StatusUnauthorized,
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

	// Authenticated request with valid Bearer JWT returns the caller identity.
	req := httptest.NewRequest(http.MethodGet, "/api/v1/me", http.NoBody)
	req.Header.Set("Authorization", bearerToken)
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("authenticated GET /api/v1/me: got %d, want 200 (%s)", w.Code, w.Body.String())
	}
	var currentUser auth.User
	if err := json.Unmarshal(w.Body.Bytes(), &currentUser); err != nil {
		t.Fatal(err)
	}
	if currentUser.ID != authtest.UserID || currentUser.Subject != authtest.Subject || currentUser.Name != authtest.Name || currentUser.Email != authtest.Email {
		t.Fatalf("unexpected current user: %+v", currentUser)
	}

	spec := OpenAPI()
	if op := spec.Paths["/api/v1/me"].Get; len(op.Security) == 0 || op.Security[0]["bearer"] == nil {
		t.Fatal("OpenAPI does not document bearer JWT authentication on /api/v1/me")
	}
	scheme := spec.Components.SecuritySchemes["bearer"]
	if scheme == nil || scheme.Type != "http" || scheme.Scheme != "bearer" || scheme.BearerFormat != "JWT" {
		t.Fatalf("unexpected OpenAPI bearer security scheme: %+v", scheme)
	}

	w = httptest.NewRecorder()
	New(nil, nil).ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/v1/me", http.NoBody))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("missing auth configuration: %d", w.Code)
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
		if _, ok := op.Security[0]["bearer"]; !ok {
			t.Fatal("missing Bearer JWT security")
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
