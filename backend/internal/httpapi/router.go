package httpapi

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/go-chi/chi/v5"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

func New() http.Handler {
	mux := chi.NewRouter()
	cfg := huma.DefaultConfig("Taramisu API", "1.0.0")
	cfg.DocsRenderer = huma.DocsRendererSwaggerUI
	api := humachi.New(mux, cfg)

	h := &handlers.Health{}
	huma.Get(api, "/health/live", h.Live)
	return mux
}
