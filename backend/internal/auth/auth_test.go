package auth

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
)

const (
	localUserID = "018f5031-7016-750a-a08b-20c2a25b1819"
	aliceSub    = "6b5a9e1a-3b6e-4c9a-8a1e-1d2c3b4a5f6e"
)

type testUsers struct {
	mu    sync.Mutex
	calls int
	err   error
	bySub map[string]string
}

func (s *testUsers) UpsertIAMUser(_ context.Context, subject string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.calls++
	if s.err != nil {
		return "", s.err
	}
	if s.bySub != nil {
		if id, ok := s.bySub[subject]; ok {
			return id, nil
		}
	}
	if subject == aliceSub {
		return localUserID, nil
	}
	return "", fmt.Errorf("unexpected subject %q", subject)
}

func (s *testUsers) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

type authFixture struct {
	manager    *Manager
	handler    http.Handler
	users      testUsers
	issuer     string
	jwksURL    string
	signer     jose.Signer
	beforeKeys func(*http.Request)
}

func newAuthFixture(t *testing.T) *authFixture {
	t.Helper()
	f := &authFixture{
		issuer: "http://localhost/auth/application/o/taramisu/",
	}
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	signer, err := jose.NewSigner(
		jose.SigningKey{Algorithm: jose.RS256, Key: key},
		(&jose.SignerOptions{}).WithType("JWT").WithHeader("kid", "key-1"),
	)
	if err != nil {
		t.Fatal(err)
	}
	f.signer = signer

	jwksServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/application/o/taramisu/jwks/" {
			http.NotFound(w, r)
			return
		}
		if f.beforeKeys != nil {
			f.beforeKeys(r)
		}
		if r.Context().Err() != nil {
			return
		}
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(jose.JSONWebKeySet{
			Keys: []jose.JSONWebKey{{
				Key:       &key.PublicKey,
				KeyID:     "key-1",
				Algorithm: "RS256",
				Use:       "sig",
			}},
		}); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(jwksServer.Close)
	f.jwksURL = jwksServer.URL + "/auth/application/o/taramisu/jwks/"

	manager, err := New(context.Background(), Config{
		Issuer:      f.issuer,
		ClientID:    "taramisu",
		JWKSURL:     f.jwksURL,
		JWKSTimeout: 100 * time.Millisecond,
	}, &f.users)
	if err != nil {
		t.Fatal(err)
	}
	f.manager = manager

	mux := http.NewServeMux()
	mux.Handle("GET /api/v1/me", manager.Require(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewEncoder(w).Encode(UserFromContext(r.Context())); err != nil {
			t.Error(err)
		}
	})))
	f.handler = mux
	return f
}

func (f *authFixture) signToken(t *testing.T, overrides map[string]any) string {
	t.Helper()
	now := time.Now()
	claims := map[string]any{
		"iss":   f.issuer,
		"sub":   aliceSub,
		"aud":   "taramisu",
		"name":  "Alice Example",
		"email": "alice@example.com",
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
	signed, err := f.signer.Sign(payload)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := signed.CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func (f *authFixture) requestWithAuth(authHeader string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, "/api/v1/me", http.NoBody)
	if authHeader != "" {
		r.Header.Set("Authorization", authHeader)
	}
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)
	return w
}

func TestStatelessJWTAuthenticationAndSubjectCache(t *testing.T) {
	f := newAuthFixture(t)
	token := f.signToken(t, nil)

	// First request verifies JWT via JWKS, upserts IAM user, and caches sub->UUID.
	w := f.requestWithAuth("Bearer " + token)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}
	if w.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", w.Header().Get("Cache-Control"))
	}
	var user User
	if err := json.Unmarshal(w.Body.Bytes(), &user); err != nil {
		t.Fatal(err)
	}
	if user.ID != localUserID || user.Subject != aliceSub || user.Issuer != f.issuer || user.Name != "Alice Example" || user.Email != "alice@example.com" {
		t.Fatalf("unexpected authenticated user: %+v", user)
	}
	if f.users.callCount() != 1 {
		t.Fatalf("expected 1 database upsert call, got %d", f.users.callCount())
	}

	// Second request with valid JWT resolves UserID from the per-replica TTL cache without hitting the database again.
	w = f.requestWithAuth("bearer " + token)
	if w.Code != http.StatusOK || f.users.callCount() != 1 {
		t.Fatalf("expected cached user resolution (calls=1), got status=%d calls=%d", w.Code, f.users.callCount())
	}
}

func TestRejectMissingInvalidOrMalformedTokens(t *testing.T) {
	f := newAuthFixture(t)
	validToken := f.signToken(t, nil)
	tampered := validToken[:len(validToken)-8] + "tampered"

	// Create an HS256 token to verify algorithm allowlist enforcement (only RS256 is permitted).
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	payload := base64.RawURLEncoding.EncodeToString([]byte(fmt.Sprintf(
		`{"iss":%q,"sub":%q,"aud":"taramisu","name":"Alice","email":"alice@example.com","exp":%d}`,
		f.issuer, aliceSub, time.Now().Add(time.Hour).Unix(),
	)))
	mac := hmac.New(sha256.New, []byte("secret"))
	mac.Write([]byte(header + "." + payload))
	hs256Token := header + "." + payload + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))

	// Missing and expired tokens are routine and logged at info; other failures at warn.
	logged := func(level, reason string) string {
		return `"level":"` + level + `","msg":"authentication failed","reason":"` + reason + `"`
	}
	logMissing, logExpired := logged("INFO", "missing_token"), logged("INFO", "expired_token")
	logInvalid, logClaims, logDecode := logged("WARN", "invalid_token"), logged("WARN", "missing_claims"), logged("WARN", "invalid_claims")
	tests := []struct {
		name   string
		header string
		log    string // expected log entry
	}{
		{"missing header", "", logMissing},
		{"basic auth scheme", "Basic dXNlcjpwYXNz", logMissing},
		{"empty bearer token", "Bearer    ", logMissing},
		{"malformed jwt", "Bearer not-a-jwt", logInvalid},
		{"tampered signature", "Bearer " + tampered, logInvalid},
		{"disallowed algorithm HS256", "Bearer " + hs256Token, logInvalid},
		{"wrong issuer", "Bearer " + f.signToken(t, map[string]any{"iss": "https://other.example"}), logInvalid},
		{"wrong audience", "Bearer " + f.signToken(t, map[string]any{"aud": "other-client"}), logInvalid},
		{"expired token", "Bearer " + f.signToken(t, map[string]any{"exp": time.Now().Add(-time.Minute).Unix()}), logExpired},
		{"missing sub", "Bearer " + f.signToken(t, map[string]any{"sub": ""}), logClaims},
		{"blank sub", "Bearer " + f.signToken(t, map[string]any{"sub": "   "}), logClaims},
		{"missing name", "Bearer " + f.signToken(t, map[string]any{"name": nil}), logClaims},
		{"blank name", "Bearer " + f.signToken(t, map[string]any{"name": "   "}), logClaims},
		{"missing email", "Bearer " + f.signToken(t, map[string]any{"email": nil}), logClaims},
		{"blank email", "Bearer " + f.signToken(t, map[string]any{"email": "   "}), logClaims},
		{"non-string claim type", "Bearer " + f.signToken(t, map[string]any{"name": 12345}), logDecode},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var logs strings.Builder
			previous := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
			w := f.requestWithAuth(tt.header)
			slog.SetDefault(previous)
			if !strings.Contains(logs.String(), tt.log) {
				t.Errorf("log = %s, want %s", logs.String(), tt.log)
			}
			if w.Code != http.StatusUnauthorized {
				t.Fatalf("got status %d, want 401 (%s)", w.Code, w.Body.String())
			}
			if !strings.HasPrefix(w.Header().Get("WWW-Authenticate"), "Bearer") {
				t.Fatalf("missing WWW-Authenticate Bearer header: %q", w.Header().Get("WWW-Authenticate"))
			}
			if f.users.callCount() != 0 {
				t.Fatalf("invalid token must not query database, got %d calls", f.users.callCount())
			}
		})
	}
}

func TestDatabaseFailureReturnsServiceUnavailable(t *testing.T) {
	f := newAuthFixture(t)
	f.users.err = errors.New("database down")

	w := f.requestWithAuth("Bearer " + f.signToken(t, nil))
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when database fails, got %d", w.Code)
	}
}

func TestJWKSFetchCancellationAndRecovery(t *testing.T) {
	f := newAuthFixture(t)
	var requests atomic.Int32
	canceled, release := make(chan struct{}), make(chan struct{})
	t.Cleanup(func() { close(release) })
	f.beforeKeys = func(r *http.Request) {
		if requests.Add(1) == 1 {
			select {
			case <-r.Context().Done():
				close(canceled)
			case <-release:
			}
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	r := httptest.NewRequestWithContext(ctx, http.MethodGet, "/api/v1/me", http.NoBody)
	r.Header.Set("Authorization", "Bearer "+f.signToken(t, nil))
	w := httptest.NewRecorder()
	f.handler.ServeHTTP(w, r)

	if w.Code != http.StatusUnauthorized || f.users.callCount() != 0 || requests.Load() != 1 {
		t.Fatalf("stalled JWKS fetch did not reject request: %d %s", w.Code, w.Body.String())
	}
	select {
	case <-canceled:
	case <-time.After(2 * time.Second):
		t.Fatal("JWKS request remained active after request context cancellation")
	}

	// Subsequent request recovers and succeeds.
	w = f.requestWithAuth("Bearer " + f.signToken(t, nil))
	if w.Code != http.StatusOK || f.users.callCount() != 1 || requests.Load() != 2 {
		t.Fatalf("expected recovery on second request, got status=%d calls=%d jwks=%d", w.Code, f.users.callCount(), requests.Load())
	}
}

func TestConcurrentRequestsIsolateUserContext(t *testing.T) {
	f := newAuthFixture(t)
	f.users.bySub = map[string]string{
		"sub-1": "00000000-0000-0000-0000-000000000001",
		"sub-2": "00000000-0000-0000-0000-000000000002",
		"sub-3": "00000000-0000-0000-0000-000000000003",
	}

	type principal struct {
		sub, id, name, email, token string
	}
	principals := []principal{
		{sub: "sub-1", id: "00000000-0000-0000-0000-000000000001", name: "User One", email: "one@example.com"},
		{sub: "sub-2", id: "00000000-0000-0000-0000-000000000002", name: "User Two", email: "two@example.com"},
		{sub: "sub-3", id: "00000000-0000-0000-0000-000000000003", name: "User Three", email: "three@example.com"},
	}
	for i := range principals {
		p := &principals[i]
		p.token = f.signToken(t, map[string]any{"sub": p.sub, "name": p.name, "email": p.email})
	}

	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		p := principals[i%len(principals)]
		wg.Add(1)
		go func(p principal) {
			defer wg.Done()
			w := f.requestWithAuth("Bearer " + p.token)
			if w.Code != http.StatusOK {
				t.Errorf("unexpected status %d", w.Code)
				return
			}
			var got User
			if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
				t.Errorf("decode user: %v", err)
				return
			}
			if got.ID != p.id || got.Subject != p.sub || got.Name != p.name || got.Email != p.email {
				t.Errorf("context bleed: got %+v, want %+v", got, p)
			}
		}(p)
	}
	wg.Wait()
}

func TestNewConfigValidation(t *testing.T) {
	users := &testUsers{}
	for _, tc := range []struct {
		name  string
		cfg   Config
		store UserStore
	}{
		{"empty issuer", Config{ClientID: "taramisu"}, users},
		{"invalid issuer scheme", Config{Issuer: "ftp://localhost/auth", ClientID: "taramisu"}, users},
		{"issuer with query", Config{Issuer: "http://localhost/auth?a=1", ClientID: "taramisu"}, users},
		{"missing client ID", Config{Issuer: "http://localhost/auth", ClientID: "   "}, users},
		{"invalid JWKS URL", Config{Issuer: "http://localhost/auth", ClientID: "taramisu", JWKSURL: "://bad"}, users},
		{"nil user store", Config{Issuer: "http://localhost/auth", ClientID: "taramisu"}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := New(context.Background(), tc.cfg, tc.store); err == nil {
				t.Fatalf("expected error for %s", tc.name)
			}
		})
	}

	// Default JWKS URL derivation succeeds without network access during New().
	if _, err := New(context.Background(), Config{
		Issuer:   "http://localhost/auth/application/o/taramisu/",
		ClientID: "taramisu",
	}, users); err != nil {
		t.Fatalf("unexpected error with default JWKS URL: %v", err)
	}
}
