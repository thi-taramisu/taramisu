package authtest

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

// todo this token will change in the future
const (
	UserID = "018f5031-7016-750a-a08b-20c2a25b1819"

	subject       = "test-user"
	clientID      = "taramisu"
	sessionCookie = "taramisu_session"
)

type users struct{}

func (users) UpsertIAMUser(context.Context, string) (string, error) { return UserID, nil }

func Login(t testing.TB) (*auth.Manager, *http.Cookie) {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var issuer, nonce string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		var body any
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			body = map[string]any{
				"issuer": issuer, "authorization_endpoint": issuer + "/authorize",
				"token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys",
				"id_token_signing_alg_values_supported": []string{"RS256"},
			}
		case "/keys":
			body = jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, Algorithm: "RS256", Use: "sig"}}}
		case "/token":
			payload, _ := json.Marshal(map[string]any{ //todo this token will change in the future
				"iss": issuer, "sub": subject, "aud": clientID, "nonce": nonce,
				"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
			})
			signed, err := signer.Sign(payload)
			if err != nil {
				t.Error(err)
				w.WriteHeader(http.StatusInternalServerError)
				return
			}
			raw, _ := signed.CompactSerialize()
			body = map[string]string{"access_token": "unused", "token_type": "Bearer", "id_token": raw}
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

	manager, err := auth.New(context.Background(), auth.Config{
		Issuer: issuer, ClientID: clientID, ClientSecret: "secret", AppURL: "http://localhost:8080",
	}, users{})
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	manager.Login(rr, httptest.NewRequest(http.MethodGet, "/auth/login", http.NoBody))
	redirect, err := url.Parse(rr.Header().Get("Location"))
	if err != nil || rr.Code != http.StatusFound {
		t.Fatalf("login redirect: %d %q", rr.Code, rr.Header().Get("Location"))
	}
	q := redirect.Query()
	nonce = q.Get("nonce")
	callback := httptest.NewRequest(http.MethodGet, "/auth/callback?code=ok&state="+url.QueryEscape(q.Get("state")), http.NoBody)
	for _, c := range rr.Result().Cookies() {
		callback.AddCookie(c)
	}
	rr = httptest.NewRecorder()
	manager.Callback(rr, callback)
	for _, c := range rr.Result().Cookies() {
		if c.Name == sessionCookie {
			return manager, c
		}
	}
	t.Fatalf("login callback set no session cookie: %d %s", rr.Code, rr.Body.String())
	return nil, nil
}
