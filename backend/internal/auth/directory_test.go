package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestDirectoryResolverCachesAndExpiresUsersAndGroups(t *testing.T) {
	var userCalls, groupCalls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-service-token" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/auth/api/v3/core/users/":
			userCalls.Add(1)
			uuid := r.URL.Query().Get("uuid")
			if uuid == "user-uuid-1" {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"results": []map[string]string{{
						"uuid":     "user-uuid-1",
						"username": "alice",
						"name":     "Alice Example",
						"email":    "alice@example.com",
					}},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"results": []any{}})
		case "/auth/api/v3/core/groups/group-uuid-1/":
			groupCalls.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]string{
				"pk":   "group-uuid-1",
				"name": "TARA Reviewers",
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)

	resolver, err := NewDirectoryResolver(DirectoryConfig{
		BaseURL:    server.URL + "/auth/",
		Token:      "test-service-token",
		TTL:        5 * time.Minute,
		MaxEntries: 2,
	})
	if err != nil {
		t.Fatalf("NewDirectoryResolver: %v", err)
	}

	now := time.Now()
	resolver.users.now = func() time.Time { return now }
	resolver.groups.now = func() time.Time { return now }

	// First user lookup fetches from Authentik.
	u, err := resolver.ResolveUser(context.Background(), "user-uuid-1")
	if err != nil {
		t.Fatalf("ResolveUser: %v", err)
	}
	if u.Name != "Alice Example" || u.Email != "alice@example.com" || u.Username != "alice" || userCalls.Load() != 1 {
		t.Fatalf("unexpected user metadata: %+v (calls=%d)", u, userCalls.Load())
	}

	// Second user lookup within TTL hits in-memory cache without an HTTP call.
	u, err = resolver.ResolveUser(context.Background(), "user-uuid-1")
	if err != nil || u.Name != "Alice Example" || userCalls.Load() != 1 {
		t.Fatalf("expected cache hit, got err=%v calls=%d", err, userCalls.Load())
	}

	// Advance clock past TTL; next lookup re-fetches from Authentik.
	now = now.Add(6 * time.Minute)
	_, err = resolver.ResolveUser(context.Background(), "user-uuid-1")
	if err != nil || userCalls.Load() != 2 {
		t.Fatalf("expected cache expiration refetch, got err=%v calls=%d", err, userCalls.Load())
	}

	// Group lookup + cache hit.
	g, err := resolver.ResolveGroup(context.Background(), "group-uuid-1")
	if err != nil || g.Name != "TARA Reviewers" || groupCalls.Load() != 1 {
		t.Fatalf("unexpected group metadata: %+v err=%v calls=%d", g, err, groupCalls.Load())
	}
	_, err = resolver.ResolveGroup(context.Background(), "group-uuid-1")
	if err != nil || groupCalls.Load() != 1 {
		t.Fatalf("expected group cache hit, got err=%v calls=%d", err, groupCalls.Load())
	}

	// Unknown principals return ErrPrincipalNotFound.
	if _, err := resolver.ResolveUser(context.Background(), "unknown"); !errors.Is(err, ErrPrincipalNotFound) {
		t.Fatalf("ResolveUser(unknown) = %v, want ErrPrincipalNotFound", err)
	}
	if _, err := resolver.ResolveGroup(context.Background(), "unknown"); !errors.Is(err, ErrPrincipalNotFound) {
		t.Fatalf("ResolveGroup(unknown) = %v, want ErrPrincipalNotFound", err)
	}
}

func TestDirectoryResolverValidationAndErrors(t *testing.T) {
	for _, cfg := range []DirectoryConfig{
		{BaseURL: "", Token: "tok"},
		{BaseURL: "ftp://localhost", Token: "tok"},
		{BaseURL: "http://localhost?query=1", Token: "tok"},
		{BaseURL: "http://localhost", Token: "   "},
	} {
		if _, err := NewDirectoryResolver(cfg); err == nil {
			t.Fatalf("accepted invalid DirectoryConfig: %+v", cfg)
		}
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/api/v3/core/groups/empty-pk/" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]string{"name": "No PK"})
			return
		}
		if r.URL.Path == "/api/v3/core/groups/bad-json/" {
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte("{invalid"))
			return
		}
		w.WriteHeader(http.StatusBadGateway)
	}))
	t.Cleanup(server.Close)

	resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := resolver.ResolveUser(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty subject")
	}
	if _, err := resolver.ResolveGroup(context.Background(), ""); err == nil {
		t.Fatal("expected error for empty group ID")
	}
	if _, err := resolver.ResolveUser(context.Background(), "any"); err == nil {
		t.Fatal("expected error on 502 status")
	}
	if _, err := resolver.ResolveGroup(context.Background(), "empty-pk"); !errors.Is(err, ErrPrincipalNotFound) {
		t.Fatalf("got %v, want ErrPrincipalNotFound", err)
	}
	if _, err := resolver.ResolveGroup(context.Background(), "bad-json"); err == nil {
		t.Fatal("expected JSON decode error")
	}
}

func TestTTLCacheEviction(t *testing.T) {
	c := newTTLCache[string, int](0, 0)
	now := time.Now()
	c.now = func() time.Time { return now }
	c.maxSize = 2
	c.ttl = 5 * time.Minute

	c.set("a", 1)
	now = now.Add(time.Minute)
	c.set("b", 2)
	// Cache is full (2/2); adding "c" should evict the oldest entry ("a").
	now = now.Add(time.Minute)
	c.set("c", 3)

	if _, ok := c.get("a"); ok {
		t.Fatal("expected oldest entry 'a' to be evicted")
	}
	if v, ok := c.get("b"); !ok || v != 2 {
		t.Fatalf("expected 'b' to remain in cache, got %v %v", v, ok)
	}
	if v, ok := c.get("c"); !ok || v != 3 {
		t.Fatalf("expected 'c' in cache, got %v %v", v, ok)
	}

	// Expire "b" and insert "d"; expired entry "b" should be evicted first.
	now = now.Add(4 * time.Minute)
	c.set("d", 4)
	if _, ok := c.get("b"); ok {
		t.Fatal("expected expired entry 'b' to be evicted")
	}
	if v, ok := c.get("c"); !ok || v != 3 {
		t.Fatalf("expected unexpired 'c' to remain, got %v %v", v, ok)
	}
}

func TestTTLCacheUpdateDoesNotEvict(t *testing.T) {
	c := newTTLCache[string, int](5*time.Minute, 2)
	now := time.Now()
	c.now = func() time.Time { return now }

	c.set("a", 1)
	now = now.Add(time.Minute)
	c.set("b", 2)

	// Updating existing key "b" in a full cache (2/2) must not evict "a".
	now = now.Add(time.Minute)
	c.set("b", 20)

	if v, ok := c.get("a"); !ok || v != 1 {
		t.Fatalf("expected 'a' to remain in cache with value 1, got %v (found: %v)", v, ok)
	}
	if v, ok := c.get("b"); !ok || v != 20 {
		t.Fatalf("expected 'b' to return updated value 20, got %v (found: %v)", v, ok)
	}
}
