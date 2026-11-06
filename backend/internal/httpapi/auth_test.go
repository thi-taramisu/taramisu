package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
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
