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

type Queries interface {
	handlers.StatusReader
	handlers.ProjectAccessStore
	handlers.TaraProjectStore
	handlers.AttackPathStore
	handlers.AttackFeasibilityRatingStore
	handlers.ThreatAttackPathLinkStore
	handlers.ProjectMemberStore
	handlers.ItemDefinitionStore
	handlers.RiskValueStore
	handlers.RiskTreatmentDecisionStore
}

// Option configures optional dependencies of the API.
type Option func(*options)

type options struct {
	directory handlers.Directory
}

// WithDirectory enables Authentik user and group lookups for project members.
func WithDirectory(directory handlers.Directory) Option {
	return func(o *options) { o.directory = directory }
}

func New(queries Queries, manager *auth.Manager, opts ...Option) http.Handler {
	mux, _ := newAPI(queries, manager, opts...)
	return mux
}

func OpenAPI() *huma.OpenAPI {
	_, api := newAPI(nil, nil)
	return api.OpenAPI()
}

func newAPI(queries Queries, manager *auth.Manager, opts ...Option) (*chi.Mux, huma.API) {
	var o options
	for _, opt := range opts {
		opt(&o)
	}
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
		"bearer": {
			Type:         "http",
			Scheme:       "bearer",
			BearerFormat: "JWT",
		},
	}
	api := humachi.New(mux, cfg)

	huma.Get(api, "/health/live", h.Live)
	huma.Get(api, "/health/ready", h.Ready)
	handlers.NewTaraProject(queries, queries).Register(api)
	handlers.NewItemDefinitions(queries, queries).Register(api)
	handlers.NewRiskValues(queries, queries).Register(api)
	handlers.NewRiskTreatmentDecisions(queries, queries).Register(api)
	handlers.NewProjectMembers(queries, queries, o.directory).Register(api)
	handlers.NewAttackPath(queries, queries).Register(api)
	handlers.NewAttackFeasibilityRating(queries, queries).Register(api)
	handlers.NewThreatAttackPathLink(queries, queries).Register(api)
	handlers.Register(api, huma.Operation{
		OperationID: "current-user",
		Method:      http.MethodGet,
		Path:        "/api/v1/me",
		Summary:     "Get the current user",
		Security:    []map[string][]string{{"bearer": {}}},
	}, handlers.WithoutProject(), func(ctx context.Context, _ *struct{}) (*struct{ Body auth.User }, error) {
		return &struct{ Body auth.User }{Body: auth.UserFromContext(ctx)}, nil
	})
	// Fail closed: an /api/ operation without an access declaration must not be served.
	if err := handlers.CheckAccessDeclared(api.OpenAPI()); err != nil {
		panic(err)
	}
	return mux, api
}
