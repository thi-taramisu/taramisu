// Package authtest provides fast in-memory JWT signing and verification fixtures for route and handler tests.
package authtest

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
)

const (
	// UserID is the default internal iam_user UUID returned for authenticated test requests.
	UserID = "018f5031-7016-750a-a08b-20c2a25b1819"
	// Subject is the default external_iam_sub UUID used in signed test JWTs.
	Subject = "6b5a9e1a-3b6e-4c9a-8a1e-1d2c3b4a5f6e"
	// Name is the default display name claim in signed test JWTs.
	Name = "Development user"
	// Email is the default email claim in signed test JWTs.
	Email = "dev@taramisu.localhost"
	// ClientID is the default OIDC audience used in signed test JWTs.
	ClientID = "taramisu"
)

type defaultUsers struct{}

func (defaultUsers) UpsertIAMUser(context.Context, string) (string, error) {
	return UserID, nil
}

// Fixture holds a test JWKS server, JWT signer, and configured *auth.Manager.
type Fixture struct {
	Manager *auth.Manager
	Issuer  string
	JWKSURL string
	signer  jose.Signer
}

// NewFixture starts a local JWKS test server and returns a ready-to-use stateless JWT Fixture.
func NewFixture(t testing.TB, users auth.UserStore) *Fixture {
	t.Helper()
	if users == nil {
		users = defaultUsers{}
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: key},
		(&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "test-key-1"),
	)
	if err != nil {
		t.Fatal(err)
	}
	jwks := jose.JSONWebKeySet{
		Keys: []jose.JSONWebKey{{
			Key:       &key.PublicKey,
			KeyID:     "test-key-1",
			Algorithm: string(jose.RS256),
			Use:       "sig",
		}},
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/application/o/taramisu/jwks/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(jwks); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(server.Close)

	issuer := "http://localhost/auth/application/o/taramisu/"
	jwksURL := server.URL + "/auth/application/o/taramisu/jwks/"
	manager, err := auth.New(context.Background(), auth.Config{
		Issuer:   issuer,
		ClientID: ClientID,
		JWKSURL:  jwksURL,
	}, users)
	if err != nil {
		t.Fatal(err)
	}
	return &Fixture{
		Manager: manager,
		Issuer:  issuer,
		JWKSURL: jwksURL,
		signer:  signer,
	}
}

// Token signs a test JWT with the default valid claims merged with any custom overrides.
func (f *Fixture) Token(t testing.TB, overrides map[string]any) string {
	t.Helper()
	now := time.Now()
	claims := map[string]any{
		"iss":   f.Issuer,
		"sub":   Subject,
		"aud":   ClientID,
		"name":  Name,
		"email": Email,
		"iat":   now.Unix(),
		"exp":   now.Add(10 * time.Minute).Unix(),
	}
	for k, v := range overrides {
		if v == nil {
			delete(claims, k)
		} else {
			claims[k] = v
		}
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	jws, err := f.signer.Sign(payload)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := jws.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

// NewManagerAndToken returns a configured *auth.Manager and a valid "Bearer <JWT>" Authorization header value.
func NewManagerAndToken(t testing.TB) (*auth.Manager, string) {
	t.Helper()
	f := NewFixture(t, nil)
	return f.Manager, "Bearer " + f.Token(t, nil)
}
