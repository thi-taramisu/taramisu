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

func New(status handlers.StatusReader, projects handlers.TaraProjectStore, manager *auth.Manager) http.Handler {
	mux, _ := newAPI(status, projects, manager)
	return mux
}

func OpenAPI() *huma.OpenAPI {
	_, api := newAPI(nil, nil, nil)
	return api.OpenAPI()
}

func newAPI(status handlers.StatusReader, projects handlers.TaraProjectStore, manager *auth.Manager) (*chi.Mux, huma.API) {
	h := handlers.NewHealth(status)
	tp := handlers.NewTaraProject(projects)
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
	cfg.Tags = []*huma.Tag{{Name: "Tara Project", Description: "Create, read, replace, update and delete TARA projects."}}
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

	tagProject := func(o *huma.Operation) { o.Tags = []string{"Tara Project"} }
	huma.Get(api, "/api/tara-projects", tp.List, tagProject)
	huma.Post(api, "/api/tara-projects", tp.Create, tagProject, func(o *huma.Operation) { o.DefaultStatus = http.StatusCreated })
	huma.Get(api, "/api/tara-projects/{id}", tp.Get, tagProject)
	huma.Put(api, "/api/tara-projects/{id}", tp.Replace, tagProject)
	huma.Patch(api, "/api/tara-projects/{id}", tp.Update, tagProject)
	huma.Delete(api, "/api/tara-projects/{id}", tp.Delete, tagProject, func(o *huma.Operation) { o.DefaultStatus = http.StatusNoContent })
	return mux, api
}
