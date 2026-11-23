// Package auth implements stateless OIDC Bearer JWT verification and in-memory IAM caching.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/danielgtaylor/huma/v2"
	"github.com/thi-taramisu/taramisu/backend/internal/logging"
)

// Config configures stateless OIDC Bearer JWT verification.
type Config struct {
	Issuer      string
	ClientID    string
	JWKSURL     string
	CacheTTL    time.Duration
	JWKSTimeout time.Duration
}

// User represents the authenticated caller populated into the request context.
type User struct {
	ID      string `json:"id" format:"uuid"`
	Issuer  string `json:"issuer"`
	Subject string `json:"subject"`
	Name    string `json:"name"`
	Email   string `json:"email" format:"email"`
	// Groups holds the caller's assignable Authentik group UUIDs from the taramisu_groups claim.
	// It is used for project authorization only and is not part of the API response.
	Groups []string `json:"-"`
}

// UserStore resolves an external IAM subject identifier (sub) to an internal iam_user UUID.
type UserStore interface {
	UpsertIAMUser(context.Context, string) (string, error)
}

// Manager validates incoming Bearer JWT access tokens statelessly using cached JWKS public keys.
type Manager struct {
	verifier  *oidc.IDTokenVerifier
	issuer    string
	users     UserStore
	userCache *ttlCache[string, string]
}

// New constructs a stateless JWT authentication manager backed by an in-memory JWKS key set and subject-to-UUID TTL cache.
func New(ctx context.Context, cfg Config, users UserStore) (*Manager, error) {
	if err := validateEndpointURL(cfg.Issuer); err != nil {
		return nil, errors.New("OIDC_ISSUER must be a valid http(s) URL without credentials or query parameters")
	}
	if strings.TrimSpace(cfg.ClientID) == "" {
		return nil, errors.New("OIDC_CLIENT_ID is required")
	}
	jwksURL := cfg.JWKSURL
	if jwksURL == "" {
		jwksURL = strings.TrimRight(cfg.Issuer, "/") + "/jwks/"
	}
	if err := validateEndpointURL(jwksURL); err != nil {
		return nil, errors.New("OIDC_JWKS_URL must be a valid http(s) URL without credentials or query parameters")
	}
	if users == nil {
		return nil, errors.New("IAM user store is required")
	}

	// Key fetches share a background context and need their own timeout.
	jwksTimeout := cfg.JWKSTimeout
	if jwksTimeout <= 0 {
		jwksTimeout = 5 * time.Second
	}
	ctx = oidc.ClientContext(ctx, &http.Client{Timeout: jwksTimeout})
	keySet := oidc.NewRemoteKeySet(ctx, jwksURL)
	verifier := oidc.NewVerifier(cfg.Issuer, keySet, &oidc.Config{
		ClientID:             cfg.ClientID,
		SupportedSigningAlgs: []string{oidc.RS256},
	})
	return &Manager{
		verifier:  verifier,
		issuer:    cfg.Issuer,
		users:     users,
		userCache: newTTLCache[string, string](cfg.CacheTTL, defaultCacheMax),
	}, nil
}

func validateEndpointURL(raw string) error {
	if raw == "" {
		return errors.New("empty URL")
	}
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.RawQuery != "" || parsed.Fragment != "" || parsed.User != nil {
		return errors.New("invalid URL")
	}
	return nil
}

func bearerToken(header string) (string, bool) {
	scheme, token, ok := strings.Cut(strings.TrimSpace(header), " ")
	if !ok || !strings.EqualFold(scheme, "Bearer") {
		return "", false
	}
	token = strings.TrimSpace(token)
	if token == "" {
		return "", false
	}
	return token, true
}

func fail(r *http.Request, w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(huma.NewError(code, message)); err != nil {
		slog.WarnContext(r.Context(), "write authentication error response", "error", err)
	}
}

type userContextKey struct{}

// UserFromContext returns the authenticated User stored in ctx, or a zero User if unauthenticated.
func UserFromContext(ctx context.Context) User {
	user, _ := ctx.Value(userContextKey{}).(User)
	return user
}

// Require returns an HTTP middleware that validates Bearer JWTs and populates the authenticated User in the request context.
func (m *Manager) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if m == nil {
			fail(r, w, http.StatusServiceUnavailable, "authentication is not configured")
			return
		}
		rawToken, ok := bearerToken(r.Header.Get("Authorization"))
		if !ok {
			slog.InfoContext(r.Context(), "authentication failed", "reason", "missing_token")
			w.Header().Set("WWW-Authenticate", "Bearer")
			fail(r, w, http.StatusUnauthorized, "authentication required")
			return
		}

		verifyCtx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()
		token, err := m.verifier.Verify(verifyCtx, rawToken)
		if err != nil {
			// An expired token is routine (every session ends with one); other failures may be attacks.
			var expired *oidc.TokenExpiredError
			if errors.As(err, &expired) {
				slog.InfoContext(r.Context(), "authentication failed", "reason", "expired_token")
			} else {
				slog.WarnContext(r.Context(), "authentication failed", "reason", "invalid_token", "error", err)
			}
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			fail(r, w, http.StatusUnauthorized, "invalid or expired access token")
			return
		}

		var claims struct {
			Name   string   `json:"name"`
			Email  string   `json:"email"`
			Groups []string `json:"taramisu_groups"`
		}
		if err := token.Claims(&claims); err != nil {
			slog.WarnContext(r.Context(), "authentication failed", "reason", "invalid_claims", "error", err)
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			fail(r, w, http.StatusUnauthorized, "invalid token claims")
			return
		}
		if strings.TrimSpace(token.Subject) == "" || strings.TrimSpace(claims.Name) == "" || strings.TrimSpace(claims.Email) == "" {
			slog.WarnContext(r.Context(), "authentication failed", "reason", "missing_claims",
				"has_sub", strings.TrimSpace(token.Subject) != "",
				"has_name", strings.TrimSpace(claims.Name) != "",
				"has_email", strings.TrimSpace(claims.Email) != "",
			)
			w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token"`)
			fail(r, w, http.StatusUnauthorized, "missing required token claims")
			return
		}

		userID, ok := m.userCache.get(token.Subject)
		if !ok {
			userID, err = m.users.UpsertIAMUser(r.Context(), token.Subject)
			if err != nil {
				if r.Context().Err() != nil {
					slog.InfoContext(r.Context(), "request cancelled", "error", err)
				} else {
					slog.ErrorContext(r.Context(), "resolve IAM user", "error", err)
				}
				fail(r, w, http.StatusServiceUnavailable, "user database unavailable")
				return
			}
			m.userCache.set(token.Subject, userID)
		}

		logging.SetActor(r.Context(), userID)
		user := User{
			ID:      userID,
			Issuer:  m.issuer,
			Subject: token.Subject,
			Name:    claims.Name,
			Email:   claims.Email,
			Groups:  claims.Groups,
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}
