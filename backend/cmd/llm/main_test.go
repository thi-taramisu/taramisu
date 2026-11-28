package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

// fakeModelAPI records what reached the model API and answers like an OpenAI-compatible endpoint.
type fakeModelAPI struct {
	method, path, auth, cookie, body string
	calls                            int
}

func (f *fakeModelAPI) start(t *testing.T) *url.URL {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		f.calls++
		f.method, f.path = r.Method, r.URL.Path
		f.auth, f.cookie = r.Header.Get("Authorization"), r.Header.Get("Cookie")
		body, _ := io.ReadAll(r.Body)
		f.body = string(body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, `{"ok":true}`)
	}))
	t.Cleanup(server.Close)
	u, err := url.Parse(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	return u
}

func TestForwardsChatCompletionsWithServiceKey(t *testing.T) {
	var upstream fakeModelAPI
	handler := newHandler(upstream.start(t), "service-key", nil)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"m"}`))
	req.Header.Set("Authorization", "Bearer caller-token")
	req.Header.Set("Cookie", "session=secret")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK || rec.Body.String() != `{"ok":true}` {
		t.Fatalf("response = %d %q, want 200 with the upstream body", rec.Code, rec.Body.String())
	}
	if upstream.method != http.MethodPost || upstream.path != "/v1/chat/completions" {
		t.Errorf("upstream got %s %s, want POST /v1/chat/completions", upstream.method, upstream.path)
	}
	if upstream.auth != "Bearer service-key" {
		t.Errorf("upstream Authorization = %q, want the service key instead of the caller's token", upstream.auth)
	}
	if upstream.cookie != "" {
		t.Errorf("upstream Cookie = %q, want none", upstream.cookie)
	}
	if upstream.body != `{"model":"m"}` {
		t.Errorf("upstream body = %q, want the request body unchanged", upstream.body)
	}
}

func TestForwardsModelList(t *testing.T) {
	var upstream fakeModelAPI
	handler := newHandler(upstream.start(t), "service-key", nil)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/models", http.NoBody))

	if rec.Code != http.StatusOK || upstream.path != "/v1/models" {
		t.Fatalf("got %d, upstream path %q; want 200 and /v1/models", rec.Code, upstream.path)
	}
}

func TestRejectsOtherEndpointsWithoutCallingUpstream(t *testing.T) {
	tests := []struct {
		method, path string
		want         int
	}{
		{http.MethodPost, "/v1/embeddings", http.StatusNotFound},
		{http.MethodPost, "/v1/images/generations", http.StatusNotFound},
		{http.MethodGet, "/", http.StatusNotFound},
		{http.MethodGet, "/v1/chat/completions", http.StatusMethodNotAllowed},
		{http.MethodDelete, "/v1/models", http.StatusMethodNotAllowed},
	}
	for _, tt := range tests {
		t.Run(tt.method+" "+tt.path, func(t *testing.T) {
			var upstream fakeModelAPI
			handler := newHandler(upstream.start(t), "service-key", nil)

			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(tt.method, tt.path, http.NoBody))

			if rec.Code != tt.want {
				t.Errorf("status = %d, want %d", rec.Code, tt.want)
			}
			if upstream.calls != 0 {
				t.Errorf("upstream was called %d times, want 0", upstream.calls)
			}
		})
	}
}

func TestWithoutKeyReturns503WithoutCallingUpstream(t *testing.T) {
	var upstream fakeModelAPI
	handler := newHandler(upstream.start(t), "", nil)

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{}`)))

	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
	if upstream.calls != 0 {
		t.Errorf("upstream was called %d times, want 0", upstream.calls)
	}
}

func TestRejectsOversizedRequest(t *testing.T) {
	var upstream fakeModelAPI
	handler := newHandler(upstream.start(t), "service-key", nil)

	body := strings.NewReader(strings.Repeat("x", maxRequestBytes+1))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", body))

	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want 413 for a body over %d bytes", rec.Code, maxRequestBytes)
	}
	if upstream.calls != 0 {
		t.Errorf("upstream was called %d times, want 0", upstream.calls)
	}
}

func TestUnreachableModelAPIReturns502(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	u, _ := url.Parse(server.URL)
	server.Close() // nothing listens there any more

	rec := httptest.NewRecorder()
	newHandler(u, "service-key", nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/v1/models", http.NoBody))

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}
