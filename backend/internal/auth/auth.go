// Package auth implements backend OIDC login and opaque browser sessions.
package auth

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

const sessionCookie = "taramisu_session"
const loginCookie = "taramisu_login"
const sessionLifetime = 8 * time.Hour

type Config struct {
	Issuer, ClientID, ClientSecret, AppURL string
}

type User struct {
	ID      string `json:"id" format:"uuid"`
	Issuer  string `json:"issuer"`
	Subject string `json:"subject"`
}

type UserStore interface {
	UpsertIAMUser(context.Context, string) (string, error)
}

type session struct {
	User    User
	Expires time.Time
}

type login struct {
	Nonce, Verifier string
	Expires         time.Time
}

type Manager struct {
	oauth          oauth2.Config
	verifier       *oidc.IDTokenVerifier
	issuer, origin string
	secure         bool
	users          UserStore
	mu             sync.Mutex
	sessions       map[string]session
	logins         map[string]login
}

func New(ctx context.Context, cfg Config, users UserStore) (*Manager, error) {
	app, err := url.Parse(cfg.AppURL)
	if err != nil || app.Host == "" || (app.Scheme != "http" && app.Scheme != "https") || app.Path != "" || app.RawQuery != "" || app.Fragment != "" || app.User != nil {
		return nil, errors.New("APP_URL must be an http(s) origin without a trailing slash")
	}
	if cfg.Issuer == "" || cfg.ClientID == "" || cfg.ClientSecret == "" {
		return nil, errors.New("OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET are required")
	}
	if users == nil {
		return nil, errors.New("IAM user store is required")
	}
	// Key fetches share a background context and need their own timeout.
	ctx = oidc.ClientContext(ctx, &http.Client{Timeout: 5 * time.Second})
	provider, err := oidc.NewProvider(ctx, cfg.Issuer)
	if err != nil {
		return nil, err
	}
	origin := app.Scheme + "://" + app.Host
	return &Manager{
		oauth:    oauth2.Config{ClientID: cfg.ClientID, ClientSecret: cfg.ClientSecret, Endpoint: provider.Endpoint(), RedirectURL: origin + "/auth/callback", Scopes: []string{oidc.ScopeOpenID}},
		verifier: provider.Verifier(&oidc.Config{ClientID: cfg.ClientID}), issuer: cfg.Issuer, origin: origin, secure: app.Scheme == "https",
		users:    users,
		sessions: make(map[string]session), logins: make(map[string]login),
	}, nil
}

func (m *Manager) cookie(w http.ResponseWriter, name, value string, seconds int) {
	http.SetCookie(w, &http.Cookie{Name: name, Value: value, Path: "/", HttpOnly: true, Secure: m.secure, SameSite: http.SameSiteLaxMode, MaxAge: seconds})
}
func fail(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

func (m *Manager) pruneLocked() {
	now := time.Now()
	for id, s := range m.sessions {
		if !now.Before(s.Expires) {
			delete(m.sessions, id)
		}
	}
	for id, l := range m.logins {
		if !now.Before(l.Expires) {
			delete(m.logins, id)
		}
	}
}

func (m *Manager) Login(w http.ResponseWriter, r *http.Request) {
	state, nonce, verifier := rand.Text(), rand.Text(), oauth2.GenerateVerifier()
	m.mu.Lock()
	m.pruneLocked()
	if old, err := r.Cookie(loginCookie); err == nil {
		delete(m.logins, old.Value)
	}
	m.logins[state] = login{Nonce: nonce, Verifier: verifier, Expires: time.Now().Add(5 * time.Minute)}
	m.mu.Unlock()
	m.cookie(w, loginCookie, state, 300)
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, m.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier)), http.StatusFound)
}

func (m *Manager) Callback(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	cookie, err := r.Cookie(loginCookie)
	state := r.URL.Query().Get("state")
	if err != nil || state == "" || cookie.Value != state {
		fail(w, 400, "invalid login state")
		return
	}
	m.cookie(w, loginCookie, "", -1)
	m.mu.Lock()
	attempt, ok := m.logins[state]
	delete(m.logins, state)
	m.mu.Unlock()
	if !ok || !time.Now().Before(attempt.Expires) || r.URL.Query().Get("code") == "" {
		fail(w, 400, "login expired or rejected")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	token, err := m.oauth.Exchange(ctx, r.URL.Query().Get("code"), oauth2.VerifierOption(attempt.Verifier))
	if err != nil {
		var responseError *oauth2.RetrieveError
		if errors.As(err, &responseError) {
			slog.Warn("OIDC token exchange failed", "status", responseError.Response.StatusCode, "code", responseError.ErrorCode)
		} else {
			slog.Warn("OIDC token exchange failed", "error", err)
		}
		fail(w, 502, "login exchange failed")
		return
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok {
		slog.Warn("OIDC token response has no ID token")
		fail(w, 502, "missing identity token")
		return
	}
	identity, err := m.verifier.Verify(ctx, raw)
	if err != nil {
		slog.Warn("OIDC token verification failed", "error", err)
		fail(w, 401, "invalid identity token")
		return
	}
	if identity.Nonce != attempt.Nonce {
		slog.Warn("OIDC nonce mismatch")
		fail(w, 401, "invalid identity token")
		return
	}
	if identity.Subject == "" {
		slog.Warn("OIDC identity has no subject")
		fail(w, 401, "invalid identity claims")
		return
	}
	userID, err := m.users.UpsertIAMUser(ctx, identity.Subject)
	if err != nil {
		slog.Error("resolve IAM user", "error", err)
		fail(w, 503, "user database unavailable")
		return
	}
	user := User{ID: userID, Issuer: m.issuer, Subject: identity.Subject}
	id := rand.Text()
	m.mu.Lock()
	m.pruneLocked()
	if old, err := r.Cookie(sessionCookie); err == nil {
		delete(m.sessions, old.Value)
	}
	m.sessions[id] = session{User: user, Expires: time.Now().Add(sessionLifetime)}
	m.mu.Unlock()
	m.cookie(w, sessionCookie, id, int(sessionLifetime.Seconds()))
	http.Redirect(w, r, "/api/v1/me", http.StatusFound)
}

func (m *Manager) current(r *http.Request) (User, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return User{}, false
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sessions[cookie.Value]
	if !ok || !time.Now().Before(s.Expires) {
		delete(m.sessions, cookie.Value)
		return User{}, false
	}
	return s.User, true
}

type userContextKey struct{}

func UserFromContext(ctx context.Context) User {
	user, _ := ctx.Value(userContextKey{}).(User)
	return user
}

func (m *Manager) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if m == nil {
			fail(w, 503, "authentication is not configured")
			return
		}
		user, ok := m.current(r)
		if !ok {
			fail(w, 401, "authentication required")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userContextKey{}, user)))
	})
}

func (m *Manager) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Header.Get("Origin") != m.origin {
		fail(w, 403, "invalid origin")
		return
	}
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		m.mu.Lock()
		delete(m.sessions, cookie.Value)
		m.mu.Unlock()
	}
	m.cookie(w, sessionCookie, "", -1)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusNoContent)
}
