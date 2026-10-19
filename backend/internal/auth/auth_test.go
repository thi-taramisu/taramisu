package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
)

const localUserID = "018f5031-7016-750a-a08b-20c2a25b1819"

type testUsers struct {
	calls int
	err   error
}

func (s *testUsers) UpsertIAMUser(_ context.Context, subject string) (string, error) {
	s.calls++
	if subject != "alice" {
		return "", errors.New("unexpected subject")
	}
	return localUserID, s.err
}

type authFixture struct {
	handler          http.Handler
	users            testUsers
	issuer           string
	nonce, challenge string
	claims           map[string]any
}

func newAuthFixture(t *testing.T) *authFixture {
	t.Helper()
	f := &authFixture{}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			json.NewEncoder(w).Encode(map[string]any{
				"issuer": f.issuer, "authorization_endpoint": f.issuer + "/authorize",
				"token_endpoint": f.issuer + "/token", "jwks_uri": f.issuer + "/keys",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			})
		case "/keys":
			json.NewEncoder(w).Encode(jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, Algorithm: "RS256", Use: "sig"}}})
		case "/token":
			if err := r.ParseForm(); err != nil {
				t.Error(err)
			}
			hash := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if base64.RawURLEncoding.EncodeToString(hash[:]) != f.challenge {
				t.Error("PKCE verifier does not match login challenge")
			}
			if r.Form.Get("redirect_uri") != "http://localhost:8080/auth/callback" {
				t.Error("unexpected callback URI")
			}
			if r.Form.Get("code") == "rejected" {
				w.WriteHeader(http.StatusBadRequest)
				json.NewEncoder(w).Encode(map[string]string{
					"error": "invalid_grant", "error_description": "do-not-log-provider-details",
					"access_token": "do-not-log-token",
				})
				return
			}
			claims := map[string]any{
				"iss": f.issuer, "sub": "alice", "aud": "taramisu", "nonce": f.nonce,
				"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
			}
			for k, v := range f.claims {
				claims[k] = v
			}
			payload, _ := json.Marshal(claims)
			signed, err := signer.Sign(payload)
			if err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			raw, _ := signed.CompactSerialize()
			if r.Form.Get("code") == "bad-signature" {
				raw = raw[:len(raw)-8] + "tampered"
			}
			json.NewEncoder(w).Encode(map[string]string{"access_token": "unused", "token_type": "Bearer", "id_token": raw})
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(provider.Close)
	f.issuer = provider.URL
	manager, err := New(context.Background(), Config{
		Issuer: f.issuer, ClientID: "taramisu", ClientSecret: "secret", AppURL: "http://localhost:8080",
	}, &f.users)
	if err != nil {
		t.Fatal(err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /auth/login", manager.Login)
	mux.HandleFunc("GET /auth/callback", manager.Callback)
	mux.HandleFunc("POST /auth/logout", manager.Logout)
	mux.Handle("GET /api/v1/me", manager.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(UserFromContext(r.Context()))
	})))
	f.handler = mux
	return f
}

func (f *authFixture) request(method, target string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, target, nil)
	for _, cookie := range cookies {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}

func responseCookie(w *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, cookie := range w.Result().Cookies() {
		if cookie.Name == name {
			return cookie
		}
	}
	return nil
}

func (f *authFixture) login(t *testing.T) (string, *http.Cookie) {
	t.Helper()
	w := f.request("GET", "/auth/login")
	redirect, err := url.Parse(w.Header().Get("Location"))
	if err != nil || w.Code != http.StatusFound || redirect.Scheme+"://"+redirect.Host != f.issuer {
		t.Fatalf("login redirect: %d %s", w.Code, w.Header().Get("Location"))
	}
	q := redirect.Query()
	f.nonce, f.challenge = q.Get("nonce"), q.Get("code_challenge")
	cookie := responseCookie(w, "taramisu_login")
	if q.Get("state") == "" || f.nonce == "" || f.challenge == "" || q.Get("code_challenge_method") != "S256" || cookie == nil {
		t.Fatal("missing state, nonce, PKCE, or login cookie")
	}
	return "/auth/callback?state=" + url.QueryEscape(q.Get("state")), cookie
}

func TestLoginAndLogout(t *testing.T) {
	f := newAuthFixture(t)
	if w := f.request("GET", "/api/v1/me"); w.Code != http.StatusUnauthorized {
		t.Fatalf("unauthenticated request: %d", w.Code)
	}
	callback, loginCookie := f.login(t)
	w := f.request("GET", callback+"&code=ok", loginCookie)
	session := responseCookie(w, "taramisu_session")
	if w.Code != 302 || w.Header().Get("Location") != "/api/v1/me" || session == nil {
		t.Fatalf("callback failed: %d %s", w.Code, w.Body.String())
	}
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode || session.MaxAge <= 0 {
		t.Fatal("missing session cookie protections")
	}
	w = f.request("GET", "/api/v1/me", session)
	var user User
	if err := json.Unmarshal(w.Body.Bytes(), &user); err != nil {
		t.Fatal(err)
	}
	if w.Code != 200 || user.ID != localUserID || user.Subject != "alice" || user.Issuer != f.issuer || f.users.calls != 1 {
		t.Fatalf("unexpected authenticated user: %d %+v", w.Code, user)
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatal("authenticated response must not be cached")
	}
	if w := f.request("GET", callback+"&code=ok", loginCookie); w.Code != 400 {
		t.Fatal("callback replay accepted")
	}
	if w := f.request("POST", "/auth/logout", session); w.Code != 403 {
		t.Fatal("logout without same-origin protection accepted")
	}
	r := httptest.NewRequest("POST", "/auth/logout", nil)
	r.Header.Set("Origin", "http://localhost:8080")
	r.AddCookie(session)
	w = httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	if cookie := responseCookie(w, "taramisu_session"); w.Code != 204 || cookie == nil || cookie.MaxAge >= 0 {
		t.Fatal("logout did not clear the session cookie")
	}
	if w := f.request("GET", "/api/v1/me", session); w.Code != 401 {
		t.Fatal("session survived logout")
	}
}

func TestCallbackRejectsInvalidIdentity(t *testing.T) {
	f := newAuthFixture(t)
	for _, tt := range []struct {
		name   string
		claims map[string]any
		code   string
		want   int
	}{
		{"issuer", map[string]any{"iss": "https://other.example"}, "ok", 401},
		{"audience", map[string]any{"aud": "other-client"}, "ok", 401},
		{"expiry", map[string]any{"exp": time.Now().Add(-time.Hour).Unix()}, "ok", 401},
		{"nonce", map[string]any{"nonce": "wrong"}, "ok", 401},
		{"subject", map[string]any{"sub": ""}, "ok", 401},
		{"signature", nil, "bad-signature", 401},
		{"exchange", nil, "rejected", 502},
	} {
		t.Run(tt.name, func(t *testing.T) {
			f.claims = tt.claims
			callback, cookie := f.login(t)
			w := f.request("GET", callback+"&code="+tt.code, cookie)
			if w.Code != tt.want || responseCookie(w, "taramisu_session") != nil || f.users.calls != 0 {
				t.Fatalf("invalid identity reached session/database: %d %s", w.Code, w.Body.String())
			}
		})
	}
}

func TestCallbackStateAndDatabaseFailure(t *testing.T) {
	f := newAuthFixture(t)
	callback, cookie := f.login(t)
	for _, cookies := range [][]*http.Cookie{nil, {{Name: "taramisu_login", Value: "wrong"}}} {
		if w := f.request("GET", callback+"&code=ok", cookies...); w.Code != 400 || f.users.calls != 0 {
			t.Fatal("callback accepted without matching login state")
		}
	}
	f.users.err = errors.New("database unavailable")
	w := f.request("GET", callback+"&code=ok", cookie)
	if w.Code != 503 || responseCookie(w, "taramisu_session") != nil || f.users.calls != 1 {
		t.Fatalf("database failure created a session: %d", w.Code)
	}
}

func TestExchangeFailureLogsSafeDiagnostics(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	f := newAuthFixture(t)
	callback, cookie := f.login(t)
	w := f.request("GET", callback+"&code=rejected", cookie)
	if w.Code != 502 || !strings.Contains(logs.String(), "invalid_grant") || !strings.Contains(logs.String(), "status=400") {
		t.Fatal("missing exchange failure diagnostics")
	}
	if strings.Contains(logs.String(), "do-not-log") || strings.Contains(w.Body.String(), "invalid_grant") {
		t.Fatal("provider response details leaked to logs or the client")
	}
}

func TestRejectAppURLWithPath(t *testing.T) {
	for _, origin := range []string{"http://localhost:8080/", "http://localhost:8080/app"} {
		_, err := New(context.Background(), Config{AppURL: origin}, nil)
		if err == nil || !strings.Contains(err.Error(), "APP_URL") {
			t.Fatalf("accepted non-origin APP_URL %q", origin)
		}
	}
}

func TestExpiredCredentials(t *testing.T) {
	m := &Manager{
		sessions: map[string]session{"expired": {Expires: time.Now().Add(-time.Second)}},
		logins:   map[string]login{"expired": {Expires: time.Now().Add(-time.Second)}},
	}
	for _, value := range []string{"expired", "forged"} {
		r := httptest.NewRequest("GET", "/api/v1/me", nil)
		r.AddCookie(&http.Cookie{Name: sessionCookie, Value: value})
		w := httptest.NewRecorder()
		m.Require(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
			t.Error("invalid session reached handler")
		})).ServeHTTP(w, r)
		if w.Code != 401 {
			t.Fatalf("invalid session: %d", w.Code)
		}
	}
	r := httptest.NewRequest("GET", "/auth/callback?state=expired&code=ok", nil)
	r.AddCookie(&http.Cookie{Name: loginCookie, Value: "expired"})
	w := httptest.NewRecorder()
	m.Callback(w, r)
	if w.Code != 400 {
		t.Fatalf("expired login: %d", w.Code)
	}
}
