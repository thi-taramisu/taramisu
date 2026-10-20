package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
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
		json.NewEncoder(w).Encode(map[string]string{
			"issuer":                 "http://" + r.Host,
			"authorization_endpoint": "http://" + r.Host + "/authorize",
		})
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
		handler.ServeHTTP(w, httptest.NewRequest("GET", path, nil))
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
	for origin, want := range map[string]int{"": 403, "http://localhost:8080": 204} {
		r := httptest.NewRequest("POST", "/auth/logout", nil)
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
	New(nil, nil).ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/me", nil))
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
