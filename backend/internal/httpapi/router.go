package httpapi

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func New(status handlers.StatusReader, projects handlers.TaraProjectStore) http.Handler {
	mux, _ := newAPI(status, projects)
	return mux
}

func OpenAPI() *huma.OpenAPI {
	_, api := newAPI(nil, nil)
	return api.OpenAPI()
}

func newAPI(status handlers.StatusReader, projects handlers.TaraProjectStore) (*chi.Mux, huma.API) {
	h := handlers.NewHealth(status)
	tp := handlers.NewTaraProject(projects)
	mux := chi.NewRouter()
	cfg := huma.DefaultConfig("Taramisu API", "1.0.0")
	cfg.DocsRenderer = huma.DocsRendererSwaggerUI
	cfg.CreateHooks = nil
	cfg.Tags = []*huma.Tag{{Name: "Tara Project", Description: "Create, read, replace, update and delete TARA projects."}}
	api := humachi.New(mux, cfg)

	huma.Get(api, "/health/live", h.Live)
	huma.Get(api, "/health/ready", h.Ready)

	tagProject := func(o *huma.Operation) { o.Tags = []string{"Tara Project"} }
	huma.Get(api, "/api/tara-projects", tp.List, tagProject)
	huma.Post(api, "/api/tara-projects", tp.Create, tagProject, func(o *huma.Operation) { o.DefaultStatus = http.StatusCreated })
	huma.Get(api, "/api/tara-projects/{id}", tp.Get, tagProject)
	huma.Put(api, "/api/tara-projects/{id}", tp.Replace, tagProject)
	huma.Patch(api, "/api/tara-projects/{id}", tp.Update, tagProject)
	huma.Delete(api, "/api/tara-projects/{id}", tp.Delete, tagProject, func(o *huma.Operation) { o.DefaultStatus = http.StatusNoContent })
	return mux, api
}
