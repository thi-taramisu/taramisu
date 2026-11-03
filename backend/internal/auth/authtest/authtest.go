// Package authtest provides a temporary fake OIDC login for authenticated route tests.
package authtest

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

type users struct{}

func (users) UpsertIAMUser(context.Context, string) (string, error) {
	return "018f5031-7016-750a-a08b-20c2a25b1819", nil
}

// Login returns a real auth manager and session cookie after completing login
// against a fake OIDC provider. Callers should depend only on this function.
func Login(t *testing.T) (*auth.Manager, *http.Cookie) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var issuer, nonce, challenge string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var body any
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			body = map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}}
		case "/keys":
			body = jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, Algorithm: "RS256", Use: "sig"}}}
		case "/token":
			if err := r.ParseForm(); err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			hash := sha256.Sum256([]byte(r.Form.Get("code_verifier")))
			if base64.RawURLEncoding.EncodeToString(hash[:]) != challenge || r.Form.Get("code") != "ok" || r.Form.Get("redirect_uri") != "http://localhost:8080/auth/callback" {
				t.Error("unexpected token exchange or PKCE verifier")
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			payload, err := json.Marshal(map[string]any{"iss": issuer, "sub": "route-test-user", "aud": "taramisu", "nonce": nonce, "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix()})
			if err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			signed, err := signer.Sign(payload)
			if err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			token, err := signed.CompactSerialize()
			if err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			body = map[string]string{"access_token": "unused", "token_type": "Bearer", "id_token": token}
		default:
			http.NotFound(w, r)
			return
		}
		if err := json.NewEncoder(w).Encode(body); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(provider.Close)
	issuer = provider.URL
	manager, err := auth.New(context.Background(), auth.Config{Issuer: issuer, ClientID: "taramisu", ClientSecret: "test-secret", AppURL: "http://localhost:8080"}, users{})
	if err != nil {
		t.Fatal(err)
	}
	login := httptest.NewRecorder()
	manager.Login(login, httptest.NewRequest(http.MethodGet, "/auth/login", http.NoBody))
	redirect, err := url.Parse(login.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	q := redirect.Query()
	nonce, challenge = q.Get("nonce"), q.Get("code_challenge")
	if login.Code != http.StatusFound || q.Get("state") == "" || nonce == "" || challenge == "" || q.Get("code_challenge_method") != "S256" {
		t.Fatal("login did not return state, nonce and PKCE challenge")
	}
	request := httptest.NewRequest(http.MethodGet, "/auth/callback?state="+url.QueryEscape(q.Get("state"))+"&code=ok", http.NoBody)
	for _, cookie := range login.Result().Cookies() {
		request.AddCookie(cookie)
	}
	callback := httptest.NewRecorder()
	manager.Callback(callback, request)
	if callback.Code != http.StatusFound {
		t.Fatalf("login callback: %d %s", callback.Code, callback.Body)
	}
	for _, cookie := range callback.Result().Cookies() {
		if cookie.Name == "taramisu_session" && cookie.Value != "" {
			return manager, cookie
		}
	}
	t.Fatal("login did not return a session cookie")
	return nil, nil
}
