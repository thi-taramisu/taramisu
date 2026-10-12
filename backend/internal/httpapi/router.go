package httpapi

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func New(queries handlers.StatusReader) http.Handler {
	mux, _ := newAPI(queries)
	return mux
}

func OpenAPI() *huma.OpenAPI {
	_, api := newAPI(nil)
	return api.OpenAPI()
}

func newAPI(queries handlers.StatusReader) (*chi.Mux, huma.API) {
	h := handlers.NewHealth(queries)
	mux := chi.NewRouter()
	cfg := huma.DefaultConfig("Taramisu API", "1.0.0")
	cfg.DocsRenderer = huma.DocsRendererSwaggerUI
	cfg.CreateHooks = nil
	api := humachi.New(mux, cfg)

	huma.Get(api, "/health/live", h.Live)
	huma.Get(api, "/health/ready", h.Ready)
	return mux, api
}
