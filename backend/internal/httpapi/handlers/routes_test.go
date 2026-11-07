package handlers_test

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

// Embed unused interfaces to satisfy the router without replacing its registration.
type assetQueries struct {
	handlers.TaraProjectStore
	*assetStore
	handlers.StatusReader
	handlers.AssetCybersecurityPropertyStore
	handlers.DamagePropertyLinkStore
	handlers.ThreatPropertyLinkStore
}

type propertyQueries struct {
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
