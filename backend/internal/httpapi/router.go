package httpapi

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func New(queries handlers.StatusReader, manager *auth.Manager) http.Handler {
	mux, _ := newAPI(queries, manager)
	return mux
}

func OpenAPI() *huma.OpenAPI {
	_, api := newAPI(nil, nil)
	return api.OpenAPI()
}

func newAPI(queries handlers.StatusReader, manager *auth.Manager) (*chi.Mux, huma.API) {
	h := handlers.NewHealth(queries)
	mux := chi.NewRouter()
	mux.Use(func(next http.Handler) http.Handler {
		protected := manager.Require(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") {
				protected.ServeHTTP(w, r)
				return
			}
			next.ServeHTTP(w, r)
		})
	})
	cfg := huma.DefaultConfig("Taramisu API", "1.0.0")
	cfg.DocsRenderer = huma.DocsRendererSwaggerUI
	cfg.CreateHooks = nil
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"session": {Type: "apiKey", In: "cookie", Name: "taramisu_session"},
	}
	api := humachi.New(mux, cfg)

	huma.Get(api, "/health/live", h.Live)
	huma.Get(api, "/health/ready", h.Ready)
	registerAuth(api, manager)
	huma.Register(api, huma.Operation{
		OperationID: "current-user", Method: http.MethodGet, Path: "/api/v1/me",
		Summary: "Get the current user", Security: []map[string][]string{{"session": {}}},
	}, func(ctx context.Context, _ *struct{}) (*struct{ Body auth.User }, error) {
		return &struct{ Body auth.User }{Body: auth.UserFromContext(ctx)}, nil
	})
	return mux, api
}
