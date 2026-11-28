package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/thi-taramisu/taramisu/backend/internal/auth/authtest"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
	"github.com/thi-taramisu/taramisu/backend/internal/httpapi"
)

// TestRequiredIfMatch checks REQUIRE_IF_MATCH: a change of a versioned record without If-Match is
// rejected with 428 before it reaches the store, after the access check; reads, creates, and changes
// with If-Match pass. Without the option, a change without If-Match passes.
func TestRequiredIfMatch(t *testing.T) {
	store := newItemStore()
	fixture := authtest.NewFixture(t, store)
	token := "Bearer " + fixture.Token(t, nil)
	required := httpapi.New(store, fixture.Manager, httpapi.WithRequiredIfMatch())
	optional := httpapi.New(store, fixture.Manager)
	send := func(handler http.Handler, method, path, body, ifMatch string) int {
		t.Helper()
		before := store.calls
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.Header.Set("Authorization", token)
		if body != "" {
			r.Header.Set("Content-Type", "application/json")
		}
		if ifMatch != "" {
			r.Header.Set("If-Match", ifMatch)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		if w.Code == http.StatusPreconditionRequired {
			if store.calls != before {
				t.Fatalf("%s %s: 428 after the store was called", method, path)
			}
			if ct := w.Header().Get("Content-Type"); ct != "application/problem+json" {
				t.Fatalf("%s %s: 428 with Content-Type %q", method, path, ct)
			}
		}
		return w.Code
	}
	for _, tc := range []struct {
		method, body string
		ok           int
	}{
		{http.MethodPut, `{"name":"Replacement","scope_type":"COMPONENT"}`, http.StatusOK},
		{http.MethodPatch, `{"name":"Updated"}`, http.StatusOK},
		{http.MethodDelete, "", http.StatusNoContent},
	} {
		if got := send(required, tc.method, itemMember, tc.body, ""); got != http.StatusPreconditionRequired {
			t.Errorf("%s without If-Match: %d, want 428", tc.method, got)
		}
		if got := send(required, tc.method, itemMember, tc.body, "*"); got != tc.ok {
			t.Errorf("%s with If-Match: %d, want %d", tc.method, got, tc.ok)
		}
		if got := send(optional, tc.method, itemMember, tc.body, ""); got != tc.ok {
			t.Errorf("%s without If-Match, not required: %d, want %d", tc.method, got, tc.ok)
		}
	}
	if got := send(required, http.MethodGet, itemMember, "", ""); got != http.StatusOK {
		t.Errorf("GET without If-Match: %d, want 200", got)
	}
	if got := send(required, http.MethodPost, itemCollection, `{"name":"Headlamp","scope_type":"ITEM"}`, ""); got != http.StatusCreated {
		t.Errorf("POST without If-Match: %d, want 201", got)
	}
	// The access check comes first, so that 428 does not tell an outsider that the record exists.
	store.role = db.ProjectRoleVIEWER
	if got := send(required, http.MethodPatch, itemMember, `{"name":"Updated"}`, ""); got != http.StatusForbidden {
		t.Errorf("PATCH by a viewer without If-Match: %d, want 403", got)
	}
	store.role = ""
	if got := send(required, http.MethodPatch, itemMember, `{"name":"Updated"}`, ""); got != http.StatusNotFound {
		t.Errorf("PATCH by a non-member without If-Match: %d, want 404", got)
	}
}
