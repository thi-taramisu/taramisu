package httpapi

import (
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humachi"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

func registerAuth(api huma.API, manager *auth.Manager) {
	register := func(op huma.Operation, handler http.HandlerFunc) {
		api.OpenAPI().AddOperation(&op)
		if manager != nil {
			api.Adapter().Handle(&op, func(ctx huma.Context) {
				r, w := humachi.Unwrap(ctx)
				handler(w, r)
			})
		}
	}
	stringSchema := &huma.Schema{Type: "string"}
	register(huma.Operation{
		OperationID: "auth-login", Method: http.MethodGet, Path: "/auth/login",
		Summary: "Start browser login",
		Responses: map[string]*huma.Response{
			"302": {Description: "Sets taramisu_login and redirects to Authentik."},
		},
	}, manager.Login)
	register(huma.Operation{
		OperationID: "auth-callback", Method: http.MethodGet, Path: "/auth/callback",
		Summary: "Complete browser login",
		Parameters: []*huma.Param{
			{Name: "state", In: "query", Required: true, Schema: stringSchema},
			{Name: "code", In: "query", Required: true, Schema: stringSchema},
			{Name: "taramisu_login", In: "cookie", Required: true, Schema: stringSchema},
		},
		Responses: map[string]*huma.Response{
			"302": {Description: "Clears taramisu_login, sets taramisu_session and redirects to /api/v1/me."},
			"400": {Description: "Invalid, expired or rejected login attempt."},
			"401": {Description: "Invalid identity token or claims."},
			"502": {Description: "Token exchange failed or identity token missing."},
			"503": {Description: "User database unavailable."},
		},
	}, manager.Callback)
	register(huma.Operation{
		OperationID: "auth-logout", Method: http.MethodPost, Path: "/auth/logout",
		Summary: "End the backend session",
		Parameters: []*huma.Param{
			{Name: "Origin", In: "header", Required: true, Schema: stringSchema, Description: "Must match APP_URL."},
		},
		Responses: map[string]*huma.Response{
			"204": {Description: "Clears taramisu_session. The Authentik SSO session remains active."},
			"403": {Description: "Missing or invalid Origin header."},
		},
	}, manager.Logout)
}
