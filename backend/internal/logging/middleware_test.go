package logging

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

// capture routes the default logger into a buffer at level and returns the decoded JSON lines.
func capture(t *testing.T, level slog.Level) func() []map[string]any {
	t.Helper()
	var buf bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(NewHandler(&buf, level)))
	t.Cleanup(func() { slog.SetDefault(previous) })
	return func() []map[string]any {
		var lines []map[string]any
		for _, raw := range strings.Split(strings.TrimSpace(buf.String()), "\n") {
			if raw == "" {
				continue
			}
			var line map[string]any
			if err := json.Unmarshal([]byte(raw), &line); err != nil {
				t.Fatalf("log line is not JSON: %q", raw)
			}
			lines = append(lines, line)
		}
		return lines
	}
}

func newRouter(handler http.HandlerFunc) http.Handler {
	r := chi.NewRouter()
	r.Use(Middleware)
	r.Get("/api/v1/projects/{id}", handler)
	r.Get("/health/live", handler)
	return r
}

func TestMiddlewareLogsRequestWithIDRouteAndActor(t *testing.T) {
	lines := capture(t, slog.LevelInfo)
	var seenID string
	router := newRouter(func(w http.ResponseWriter, r *http.Request) {
		seenID = RequestID(r.Context())
		SetActor(r.Context(), "user-1")
		slog.InfoContext(r.Context(), "audit", "event", "member.added")
		w.WriteHeader(http.StatusCreated)
	})

	req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/42", http.NoBody)
	req.Header.Set(RequestIDHeader, "abc123")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if seenID != "abc123" || rec.Header().Get(RequestIDHeader) != "abc123" {
		t.Fatalf("request ID: handler saw %q, response header %q, want abc123", seenID, rec.Header().Get(RequestIDHeader))
	}
	got := lines()
	if len(got) != 2 {
		t.Fatalf("got %d log lines, want 2: %v", len(got), got)
	}
	if got[0]["msg"] != "audit" || got[0]["request_id"] != "abc123" {
		t.Errorf("handler log line = %v, want request_id abc123", got[0])
	}
	want := map[string]any{
		"msg": "request", "method": "GET", "path": "/api/v1/projects/42", "route": "/api/v1/projects/{id}",
		"status": float64(http.StatusCreated), "actor": "user-1", "request_id": "abc123",
	}
	for key, value := range want {
		if got[1][key] != value {
			t.Errorf("request log %s = %v, want %v", key, got[1][key], value)
		}
	}
	if _, ok := got[1]["duration_ms"]; !ok {
		t.Error("request log has no duration_ms")
	}
}

func TestMiddlewareReplacesMissingOrUnsafeRequestID(t *testing.T) {
	capture(t, slog.LevelInfo)
	router := newRouter(func(w http.ResponseWriter, r *http.Request) {})
	for _, header := range []string{"", "has space", "with\nnewline", strings.Repeat("a", 65)} {
		req := httptest.NewRequest(http.MethodGet, "/api/v1/projects/1", http.NoBody)
		req.Header.Set(RequestIDHeader, header)
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		id := rec.Header().Get(RequestIDHeader)
		if id == "" || id == header || !validRequestID.MatchString(id) {
			t.Errorf("header %q: response request ID = %q, want a newly generated ID", header, id)
		}
	}
}

func TestMiddlewareLogsHealthChecksOnlyAtDebug(t *testing.T) {
	router := newRouter(func(w http.ResponseWriter, r *http.Request) {})
	info := capture(t, slog.LevelInfo)
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health/live", http.NoBody))
	if got := info(); len(got) != 0 {
		t.Errorf("health check logged at info: %v", got)
	}
	debug := capture(t, slog.LevelDebug)
	router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/health/live", http.NoBody))
	if got := debug(); len(got) != 1 || got[0]["level"] != "DEBUG" || got[0]["path"] != "/health/live" {
		t.Errorf("health check at debug = %v, want one DEBUG request line", got)
	}
}

func TestMiddlewareRecoversPanic(t *testing.T) {
	lines := capture(t, slog.LevelInfo)
	router := newRouter(func(w http.ResponseWriter, r *http.Request) { panic("boom") })
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/projects/1", http.NoBody))

	if rec.Code != http.StatusInternalServerError || rec.Header().Get("Content-Type") != "application/problem+json" ||
		!strings.Contains(rec.Body.String(), `"status":500`) {
		t.Errorf("response = %d %q %s, want a 500 problem+json body", rec.Code, rec.Header().Get("Content-Type"), rec.Body.String())
	}
	got := lines()
	if len(got) != 2 {
		t.Fatalf("got %d log lines, want a panic entry and the request: %v", len(got), got)
	}
	stack, _ := got[0]["stack"].(string)
	if got[0]["level"] != "ERROR" || got[0]["panic"] != "boom" || !strings.Contains(stack, "middleware_test.go") {
		t.Fatalf("log lines = %v, want a panic entry with stack, then the request", got)
	}
	if got[1]["status"] != float64(http.StatusInternalServerError) {
		t.Errorf("request log status = %v, want 500", got[1]["status"])
	}
}

func TestRequestIDOutsideRequest(t *testing.T) {
	if id := RequestID(t.Context()); id != "" {
		t.Errorf("RequestID = %q, want empty", id)
	}
	SetActor(t.Context(), "ignored") // must not panic
}
