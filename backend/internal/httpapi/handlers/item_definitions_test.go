package handlers_test

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-jose/go-jose/v4"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi/handlers"
)

const projectID = "11111111-1111-4111-8111-111111111111"
const itemID = "22222222-2222-4222-8222-222222222222"
const userID = "33333333-3333-4333-8333-333333333333"
const collection = "/api/v1/projects/" + projectID + "/item-definitions"
const member = collection + "/" + itemID

type itemStore struct {
	handlers.StatusReader
	allowed bool
	err     error
	calls   int
	access  db.CanAccessItemDefinitionsParams
	patch   db.PatchItemDefinitionParams
	replace db.ReplaceItemDefinitionParams
	row     db.ItemDefinition
	count   int64
}

func newItemStore() *itemStore {
	var project, item pgtype.UUID
	if err := project.Scan(projectID); err != nil {
		panic(err)
	}
	if err := item.Scan(itemID); err != nil {
		panic(err)
	}
	return &itemStore{allowed: true, count: 1, row: db.ItemDefinition{ID: item, TaraProjectID: project, Name: "Headlamp", ScopeType: db.ScopeTypeITEM, CreatedAt: pgtype.Timestamptz{Time: time.Now(), Valid: true}}}
}
func (*itemStore) UpsertIAMUser(context.Context, string) (string, error) { return userID, nil }
func (s *itemStore) CanAccessItemDefinitions(_ context.Context, p db.CanAccessItemDefinitionsParams) (bool, error) {
	s.access = p
	return s.allowed, nil
}
func (s *itemStore) ListItemDefinitions(context.Context, db.ListItemDefinitionsParams) ([]db.ItemDefinition, error) {
	s.calls++
	return nil, s.err
}
func (s *itemStore) GetItemDefinition(_ context.Context, p db.GetItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	if p.ProjectID != s.row.TaraProjectID || p.ID != s.row.ID {
		return db.ItemDefinition{}, pgx.ErrNoRows
	}
	return s.row, s.err
}
func (s *itemStore) CreateItemDefinition(_ context.Context, p db.CreateItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.row.Name = p.Name
	s.row.ScopeType = p.ScopeType
	return s.row, s.err
}
func (s *itemStore) ReplaceItemDefinition(_ context.Context, p db.ReplaceItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.replace = p
	return s.row, s.err
}
func (s *itemStore) PatchItemDefinition(_ context.Context, p db.PatchItemDefinitionParams) (db.ItemDefinition, error) {
	s.calls++
	s.patch = p
	return s.row, s.err
}
func (s *itemStore) DeleteItemDefinition(context.Context, db.DeleteItemDefinitionParams) (int64, error) {
	s.calls++
	return s.count, s.err
}

// Authenticate through the same OIDC/session flow used by the protected API.
func authenticatedAPI(t *testing.T, store httpapi.Store, users auth.UserStore) (http.Handler, *http.Cookie) {
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
		var value any
		switch r.URL.Path {
		case "/.well-known/openid-configuration":
			value = map[string]any{"issuer": issuer, "authorization_endpoint": issuer + "/authorize", "token_endpoint": issuer + "/token", "jwks_uri": issuer + "/keys", "id_token_signing_alg_values_supported": []string{"RS256"}}
		case "/keys":
			value = jose.JSONWebKeySet{Keys: []jose.JSONWebKey{{Key: &key.PublicKey, Algorithm: "RS256", Use: "sig"}}}
		case "/token":
			payload, err := json.Marshal(map[string]any{"iss": issuer, "sub": "crud-test-user", "aud": "taramisu", "nonce": nonce, "exp": time.Now().Add(time.Hour).Unix()})
			if err != nil {
				t.Error(err)
				return
			}
			signed, err := signer.Sign(payload)
			if err != nil {
				t.Error(err)
				return
			}
			raw, err := signed.CompactSerialize()
			if err != nil {
				t.Error(err)
				return
			}
			value = map[string]string{"access_token": "test", "token_type": "Bearer", "id_token": raw}
		default:
			http.NotFound(w, r)
			return
		}
		if err := json.NewEncoder(w).Encode(value); err != nil {
			t.Error(err)
		}
	}))
	t.Cleanup(provider.Close)
	issuer = provider.URL
	manager, err := auth.New(context.Background(), auth.Config{Issuer: issuer, ClientID: "taramisu", ClientSecret: "test-secret", AppURL: "http://localhost:8080"}, users)
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.New(store, manager)
	login := request(handler, http.MethodGet, "/auth/login", "", nil)
	redirect, err := url.Parse(login.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	nonce = redirect.Query().Get("nonce")
	result := login.Result()
	cookies := result.Cookies()
	if err := result.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if len(cookies) == 0 {
		t.Fatal("missing login cookie")
	}
	callback := request(handler, http.MethodGet, "/auth/callback?code=test&state="+url.QueryEscape(redirect.Query().Get("state")), "", cookies[0])
	result = callback.Result()
	t.Cleanup(func() {
		if err := result.Body.Close(); err != nil {
			t.Error(err)
		}
	})
	for _, cookie := range result.Cookies() {
		if cookie.Name == "taramisu_session" {
			return handler, cookie
		}
	}
	t.Fatalf("login failed: %d %s", callback.Code, callback.Body.String())
	return nil, nil
}

func request(handler http.Handler, method, path, body string, cookie *http.Cookie) *httptest.ResponseRecorder {
	r := httptest.NewRequest(method, path, strings.NewReader(body))
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	if cookie != nil {
		r.AddCookie(cookie)
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestItemDefinitionRoutes(t *testing.T) {
	store := newItemStore()
	handler, cookie := authenticatedAPI(t, store, store)
	for _, tc := range []struct {
		method, path, body string
		code               int
	}{
		{"POST", collection, `{"name":"Headlamp","scope_type":"ITEM"}`, 201},
		{"GET", member, "", 200},
		{"GET", collection, "", 200},
		{"PUT", member, `{"name":"Replacement","scope_type":"COMPONENT"}`, 200},
		{"PATCH", member, `{"name":"Updated","lifecycle_phase":null,"architectural_design":"diagram"}`, 200},
		{"DELETE", member, "", 204},
	} {
		t.Run(tc.method+tc.path, func(t *testing.T) {
			unauthorized := request(handler, tc.method, tc.path, tc.body, nil)
			if unauthorized.Code != 401 {
				t.Fatalf("unauthenticated: %d", unauthorized.Code)
			}
			w := request(handler, tc.method, tc.path, tc.body, cookie)
			if w.Code != tc.code {
				t.Fatalf("got %d: %s", w.Code, w.Body.String())
			}
			if store.access.ProjectID.String() != projectID || store.access.UserID.String() != userID || store.access.ReadOnly != (tc.method == "GET") {
				t.Fatalf("wrong access check: %+v", store.access)
			}
			if tc.method == "POST" && w.Header().Get("Location") != member {
				t.Fatalf("Location: %s", w.Header().Get("Location"))
			}
			if tc.method == "GET" && tc.path == collection && strings.TrimSpace(w.Body.String()) != "[]" {
				t.Fatalf("empty collection: %s", w.Body.String())
			}
			if tc.method == "PUT" && store.replace.LifecyclePhase != nil {
				t.Fatal("replacement retained omitted optional field")
			}
			if tc.method == "PATCH" {
				p := store.patch
				if !p.SetLifecyclePhase || p.LifecyclePhase != nil || p.SetItemDefinition || p.SetCybersecuritySpecs || !p.SetArchitecturalDesign || p.ArchitecturalDesign == nil || *p.ArchitecturalDesign != "diagram" || p.Name == nil || *p.Name != "Updated" || p.ScopeType != nil {
					t.Fatalf("incorrect patch presence/null handling: %+v", p)
				}
			}
		})
	}
}

func TestItemDefinitionValidationAndErrors(t *testing.T) {
	store := newItemStore()
	handler, cookie := authenticatedAPI(t, store, store)
	for _, tc := range []struct{ method, path, body string }{
		{"POST", collection, `{"name":"","scope_type":"ITEM"}`},
		{"POST", collection, `{"name":"   ","scope_type":"ITEM"}`},
		{"POST", collection, `{"name":"A","scope_type":"INVALID"}`},
		{"POST", collection, `{"name":"A"}`},
		{"PUT", member, `{"scope_type":"ITEM"}`},
		{"PATCH", member, `{"name":null}`},
		{"PATCH", member, `{"scope_type":null}`},
		{"PATCH", member, `{"scope_type":"INVALID"}`},
		{"PATCH", member, `{"lifecycle_phase":123}`},
		{"PATCH", member, `{"unknown":"field"}`},
		{"GET", collection + "?limit=101", ""},
		{"GET", collection + "?offset=-1", ""},
		{"GET", collection + "/not-a-uuid", ""},
		{"GET", "/api/v1/projects/invalid/item-definitions", ""},
	} {
		w := request(handler, tc.method, tc.path, tc.body, cookie)
		if w.Code != 422 {
			t.Errorf("%s %s %s: got %d %s", tc.method, tc.path, tc.body, w.Code, w.Body.String())
		}
	}
	if store.calls != 0 {
		t.Fatal("invalid request reached storage")
	}
	store.allowed = false
	for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
		path, body := member, `{"name":"A","scope_type":"ITEM"}`
		if method == "POST" {
			path = collection
		}
		w := request(handler, method, path, body, cookie)
		if w.Code != 404 {
			t.Errorf("inaccessible project %s: %d", method, w.Code)
		}
	}
	if store.calls != 0 {
		t.Fatal("unauthorized request reached storage")
	}
	store.allowed = true
	for _, tc := range []struct {
		err  error
		code int
	}{
		{pgx.ErrNoRows, 404},
		{&pgconn.PgError{Code: "23503"}, 409},
		{errors.New("private database details"), 500},
	} {
		store.err = tc.err
		for _, method := range []string{"GET", "POST", "PUT", "PATCH", "DELETE"} {
			path := member
			if method == "POST" {
				path = collection
			}
			w := request(handler, method, path, `{"name":"A","scope_type":"ITEM"}`, cookie)
			if w.Code != tc.code || strings.Contains(w.Body.String(), "private database details") {
				t.Errorf("%s error: %d %s", method, w.Code, w.Body.String())
			}
		}
	}
	store.err = nil
	store.count = 0
	if w := request(handler, "DELETE", member, "", cookie); w.Code != 404 {
		t.Fatalf("missing delete: %d", w.Code)
	}
}

func TestItemDefinitionOpenAPI(t *testing.T) {
	spec := httpapi.OpenAPI()
	for path, methods := range map[string][]string{
		"/api/v1/projects/{project_id}/item-definitions":           {"GET", "POST"},
		"/api/v1/projects/{project_id}/item-definitions/{item_id}": {"GET", "PUT", "PATCH", "DELETE"},
	} {
		item := spec.Paths[path]
		if item == nil {
			t.Fatalf("missing path %s", path)
		}
		for _, method := range methods {
			var operationSecurity int
			switch method {
			case "GET":
				operationSecurity = len(item.Get.Security)
			case "POST":
				operationSecurity = len(item.Post.Security)
			case "PUT":
				operationSecurity = len(item.Put.Security)
			case "PATCH":
				operationSecurity = len(item.Patch.Security)
			case "DELETE":
				operationSecurity = len(item.Delete.Security)
			}
			if operationSecurity == 0 {
				t.Errorf("missing authentication: %s %s", method, path)
			}
		}
	}
}
