package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
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
			// Authentik cannot filter by uid, so the resolver reads the whole list.
			userCalls.Add(1)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"pagination": map[string]int{"next": 0},
				"results": []map[string]any{{
					"uid":      "user-uuid-1",
					"username": "alice",
					"name":     "Alice Example",
					"email":    "alice@example.com",
				}},
			})
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

func TestDirectoryResolverReadsAllUserPages(t *testing.T) {
	var pages []string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		page := r.URL.Query().Get("page")
		pages = append(pages, page)
		w.Header().Set("Content-Type", "application/json")
		if page == "1" {
			_ = json.NewEncoder(w).Encode(map[string]any{
				"pagination": map[string]int{"next": 2},
				"results":    []map[string]any{{"uid": "first", "name": "First"}},
			})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"pagination": map[string]int{"next": 0},
			"results":    []map[string]any{{"uid": "second", "name": "Second"}},
		})
	}))
	t.Cleanup(server.Close)
	resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	if u, err := resolver.ResolveUser(context.Background(), "second"); err != nil || u.Name != "Second" {
		t.Fatalf("ResolveUser(second) = %+v, %v", u, err)
	}
	// The first page was cached during the same read.
	if u, err := resolver.ResolveUser(context.Background(), "first"); err != nil || u.Name != "First" || len(pages) != 2 {
		t.Fatalf("ResolveUser(first) = %+v, %v after pages %v", u, err, pages)
	}
}

func TestDirectoryResolverFindsActiveUserByEmail(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		if r.URL.Path != "/api/v3/core/users/" || q.Get("is_active") != "true" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		// Like Authentik's search: case-insensitive substring match, so similar addresses come back too.
		results := []map[string]any{}
		stored := "notbob@example.com"
		if search := strings.ToLower(q.Get("search")); search != "" && strings.Contains(stored, search) {
			results = append(results,
				map[string]any{"uid": "notbob-sub", "username": "notbob", "email": "notbob@example.com", "is_active": true},
				map[string]any{"uid": "bob-sub", "username": "bob", "email": "Bob@Example.com", "is_active": true})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"results": results})
	}))
	t.Cleanup(server.Close)
	resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	u, err := resolver.FindActiveUserByEmail(context.Background(), " BOB@example.com ")
	if err != nil || u.Subject != "bob-sub" {
		t.Fatalf("FindActiveUserByEmail = %+v, %v", u, err)
	}
	if _, err := resolver.FindActiveUserByEmail(context.Background(), "nobody@example.com"); !errors.Is(err, ErrPrincipalNotFound) {
		t.Fatalf("unknown email: %v, want ErrPrincipalNotFound", err)
	}
	if _, err := resolver.FindActiveUserByEmail(context.Background(), " "); err == nil {
		t.Fatal("expected error for empty email")
	}
}

func TestDirectoryResolverRejectsSharedEmail(t *testing.T) {
	user := func(uid, email string, active bool) map[string]any {
		return map[string]any{"uid": uid, "email": email, "is_active": active}
	}
	for _, tc := range []struct {
		name  string
		pages [][]map[string]any
		want  error
	}{
		{"same page", [][]map[string]any{{user("a", "shared@example.com", true), user("b", "Shared@Example.com", true)}}, ErrAmbiguousEmail},
		{"separate pages", [][]map[string]any{{user("a", "shared@example.com", true)}, {user("b", "SHARED@example.com", true)}}, ErrAmbiguousEmail},
		{"inactive duplicate", [][]map[string]any{{user("a", "shared@example.com", true), user("b", "shared@example.com", false)}}, nil},
		{"same account twice", [][]map[string]any{{user("a", "shared@example.com", true)}, {user("a", "shared@example.com", true)}}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				page, _ := strconv.Atoi(r.URL.Query().Get("page"))
				if page < 1 || page > len(tc.pages) {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				next := 0
				if page < len(tc.pages) {
					next = page + 1
				}
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(map[string]any{"pagination": map[string]int{"next": next}, "results": tc.pages[page-1]})
			}))
			t.Cleanup(server.Close)
			resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok"})
			if err != nil {
				t.Fatal(err)
			}
			u, err := resolver.FindActiveUserByEmail(context.Background(), "shared@example.com")
			if !errors.Is(err, tc.want) || (tc.want == nil && u.Subject != "a") {
				t.Fatalf("FindActiveUserByEmail = %+v, %v, want error %v", u, err, tc.want)
			}
		})
	}
}

func TestDirectoryResolverRemembersUnknownSubjects(t *testing.T) {
	var reads int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reads++
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"results": []map[string]any{{"uid": "alice-sub", "username": "alice"}}})
	}))
	t.Cleanup(server.Close)
	resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok", TTL: time.Minute})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	resolver.users.now = func() time.Time { return now }
	ctx := context.Background()
	for range 3 {
		if _, err := resolver.ResolveUser(ctx, "deleted-sub"); !errors.Is(err, ErrPrincipalNotFound) {
			t.Fatalf("unknown subject: %v, want ErrPrincipalNotFound", err)
		}
	}
	if _, err := resolver.ResolveUser(ctx, "alice-sub"); err != nil {
		t.Fatalf("known subject: %v", err)
	}
	if reads != 1 {
		t.Fatalf("user list read %d times within the TTL, want 1", reads)
	}
	now = now.Add(2 * time.Minute)
	if _, err := resolver.ResolveUser(ctx, "deleted-sub"); !errors.Is(err, ErrPrincipalNotFound) {
		t.Fatalf("unknown subject after TTL: %v", err)
	}
	if reads != 2 {
		t.Fatalf("user list read %d times after the TTL, want 2", reads)
	}
}

func TestDirectoryResolverAssignableGroups(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/api/v3/core/groups/":
			if r.URL.Query().Get("attributes") != `{"taramisu_assignable": true}` {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"results": []map[string]any{
				{"pk": "team-a", "name": "Team A", "attributes": map[string]any{"taramisu_assignable": true}},
				// Defensive: entries without the attribute are dropped even if the filter returned them.
				{"pk": "admins", "name": "Admins", "attributes": map[string]any{}},
			}})
		case "/api/v3/core/groups/admins/":
			_ = json.NewEncoder(w).Encode(map[string]any{"pk": "admins", "name": "Admins", "attributes": map[string]any{}})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(server.Close)
	resolver, err := NewDirectoryResolver(DirectoryConfig{BaseURL: server.URL, Token: "tok"})
	if err != nil {
		t.Fatal(err)
	}
	groups, err := resolver.ListAssignableGroups(context.Background())
	if err != nil || len(groups) != 1 || groups[0].GroupID != "team-a" || !groups[0].Assignable {
		t.Fatalf("ListAssignableGroups = %+v, %v", groups, err)
	}
	// Listed groups are cached, so resolving them needs no further request.
	if g, err := resolver.ResolveGroup(context.Background(), "team-a"); err != nil || g.Name != "Team A" {
		t.Fatalf("ResolveGroup(team-a) = %+v, %v", g, err)
	}
	if g, err := resolver.ResolveGroup(context.Background(), "admins"); err != nil || g.Assignable {
		t.Fatalf("ResolveGroup(admins) = %+v, %v; want not assignable", g, err)
	}
}
