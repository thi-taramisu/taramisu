package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
)

// otlpSpan is the part of an OTLP span the tests look at.
type otlpSpan struct {
	TraceID    string `json:"traceId"`
	Attributes []struct {
		Key   string `json:"key"`
		Value struct {
			StringValue string `json:"stringValue"`
		} `json:"value"`
	} `json:"attributes"`
	Status struct {
		Code int `json:"code"`
	} `json:"status"`
}

// attr returns the attribute value, or "" when the span does not have it.
func (s otlpSpan) attr(key string) string {
	for _, a := range s.Attributes {
		if a.Key == key {
			return a.Value.StringValue
		}
	}
	return ""
}

// fakeLangfuse records the spans it receives on its OTLP endpoint.
type fakeLangfuse struct {
	mu    sync.Mutex
	auth  []string
	spans []otlpSpan
}

func (f *fakeLangfuse) start(t *testing.T) *langfuse {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ResourceSpans []struct {
				ScopeSpans []struct {
					Spans []otlpSpan `json:"spans"`
				} `json:"scopeSpans"`
			} `json:"resourceSpans"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		user, pass, _ := r.BasicAuth()
		f.mu.Lock()
		defer f.mu.Unlock()
		f.auth = append(f.auth, r.URL.Path+" "+user+":"+pass)
		for _, rs := range body.ResourceSpans {
			for _, ss := range rs.ScopeSpans {
				f.spans = append(f.spans, ss.Spans...)
			}
		}
	}))
	t.Cleanup(server.Close)
	l, err := newLangfuse(server.URL+"/", "pk-test", "sk-test")
	if err != nil {
		t.Fatal(err)
	}
	return l
}

// modelAPI answers every request with status and body and records the trace header it received.
func modelAPI(t *testing.T, status int, body string, traceHeaderSeen *string) *url.URL {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*traceHeaderSeen = r.Header.Get(traceHeader)
		w.WriteHeader(status)
		_, _ = io.WriteString(w, body)
	}))
	t.Cleanup(server.Close)
	u, _ := url.Parse(server.URL)
	return u
}

func chatRequest(traceID string) *http.Request {
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(
		`{"model":"qwen","messages":[{"role":"system","content":"You are..."},{"role":"user","content":"Which items?"}]}`))
	req.Header.Set(traceHeader, traceID)
	return req
}

// onlySpan returns the single span Langfuse received.
func (f *fakeLangfuse) onlySpan(t *testing.T) otlpSpan {
	t.Helper()
	if len(f.spans) != 1 {
		t.Fatalf("langfuse got %d spans, want 1", len(f.spans))
	}
	return f.spans[0]
}

const testTraceID = "0123456789abcdef0123456789abcdef"

func TestReportsChatCompletionToLangfuse(t *testing.T) {
	var lf fakeLangfuse
	tracing := lf.start(t)
	var seen string
	upstream := modelAPI(t, http.StatusOK, `{"model":"qwen-served","choices":[{"message":{"role":"assistant","content":"One item."}}],
		"usage":{"prompt_tokens":120,"completion_tokens":15}}`, &seen)
	rec := httptest.NewRecorder()
	newHandler(upstream, "service-key", tracing).ServeHTTP(rec, chatRequest(testTraceID))
	tracing.wait()

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "One item.") {
		t.Fatalf("response = %d %s, want the model's answer unchanged", rec.Code, rec.Body)
	}
	if seen != "" {
		t.Errorf("model API got %s %q, want the header removed", traceHeader, seen)
	}
	if len(lf.auth) != 1 || lf.auth[0] != "/api/public/otel/v1/traces pk-test:sk-test" {
		t.Fatalf("langfuse calls = %v, want one OTLP call with the project keys", lf.auth)
	}
	span := lf.onlySpan(t)
	if span.TraceID != testTraceID || span.Status.Code != 1 {
		t.Errorf("span trace ID = %q, status = %d; want the API's trace ID and OK", span.TraceID, span.Status.Code)
	}
	want := map[string]string{
		"langfuse.observation.type":          "generation",
		"langfuse.observation.model.name":    "qwen-served",
		"langfuse.observation.output":        "One item.",
		"langfuse.observation.usage_details": `{"input":120,"output":15}`,
		"langfuse.trace.input":               "Which items?",
		"langfuse.trace.output":              "One item.",
	}
	for key, value := range want {
		if got := span.attr(key); got != value {
			t.Errorf("%s = %q, want %q", key, got, value)
		}
	}
	if input := span.attr("langfuse.observation.input"); !strings.Contains(input, "Which items?") {
		t.Errorf("observation input = %q, want the request messages", input)
	}
}

func TestReportsToolCallWithoutTraceOutput(t *testing.T) {
	var lf fakeLangfuse
	tracing := lf.start(t)
	var seen string
	upstream := modelAPI(t, http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":"",
		"tool_calls":[{"id":"c1","type":"function","function":{"name":"get_project","arguments":"{}"}}]}}]}`, &seen)

	newHandler(upstream, "service-key", tracing).ServeHTTP(httptest.NewRecorder(), chatRequest(testTraceID))
	tracing.wait()

	span := lf.onlySpan(t)
	// The answer comes with a later call; this one must not overwrite the trace output.
	if output := span.attr("langfuse.trace.output"); output != "" {
		t.Errorf("trace output = %q, want none for a tool call", output)
	}
	if output := span.attr("langfuse.observation.output"); !strings.Contains(output, `"get_project"`) {
		t.Errorf("observation output = %q, want the tool calls", output)
	}
}

func TestReportsModelErrorAsErrorLevel(t *testing.T) {
	var lf fakeLangfuse
	tracing := lf.start(t)
	var seen string
	upstream := modelAPI(t, http.StatusTooManyRequests, `{"error":"rate limit"}`, &seen)

	rec := httptest.NewRecorder()
	newHandler(upstream, "service-key", tracing).ServeHTTP(rec, chatRequest(testTraceID))
	tracing.wait()

	if rec.Code != http.StatusTooManyRequests {
		t.Errorf("status = %d, want the model API's 429 passed on", rec.Code)
	}
	span := lf.onlySpan(t)
	if span.Status.Code != 2 || span.attr("langfuse.observation.level") != "ERROR" ||
		span.attr("langfuse.observation.status_message") != "model API answered 429" {
		t.Errorf("span = %+v, want error status and level ERROR with the model API's status", span)
	}
}

func TestDoesNotReportModelList(t *testing.T) {
	var lf fakeLangfuse
	tracing := lf.start(t)
	var seen string
	upstream := modelAPI(t, http.StatusOK, `{"data":[]}`, &seen)

	newHandler(upstream, "service-key", tracing).ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/v1/models", http.NoBody))
	tracing.wait()

	if len(lf.auth) != 0 {
		t.Errorf("langfuse got %d calls, want none for the model list", len(lf.auth))
	}
}

func TestTraceIDFromKeepsValidHeader(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/", http.NoBody)
	req.Header.Set(traceHeader, testTraceID)
	if id := traceIDFrom(req); id != testTraceID {
		t.Errorf("traceIDFrom() = %q, want the API's ID %q", id, testTraceID)
	}
}

func TestTraceIDFromRejectsInvalidHeader(t *testing.T) {
	for _, header := range []string{"", "short", "not hex at all!!", strings.Repeat("a", 33),
		"0123456789ABCDEF0123456789ABCDEF", "01234567-89ab-cdef-0123-456789abcdef"} {
		req := httptest.NewRequest(http.MethodPost, "/", http.NoBody)
		req.Header.Set(traceHeader, header)
		if id := traceIDFrom(req); id == header || !traceIDPattern.MatchString(id) {
			t.Errorf("traceIDFrom(%q) = %q, want a new valid ID", header, id)
		}
	}
}

func TestLangfuseConfig(t *testing.T) {
	tests := []struct {
		name                         string
		host, publicKey, secretKey   string
		wantTracing, wantConfigError bool
	}{
		{"not configured", "", "", "", false, false},
		{"complete", "http://host.docker.internal:3000", "pk", "sk", true, false},
		{"key missing", "http://host.docker.internal:3000", "pk", "", false, true},
		{"host missing", "", "pk", "sk", false, true},
		{"invalid host", "host.docker.internal:3000", "pk", "sk", false, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("LANGFUSE_HOST", tt.host)
			t.Setenv("LANGFUSE_PUBLIC_KEY", tt.publicKey)
			t.Setenv("LANGFUSE_SECRET_KEY", tt.secretKey)
			tracing, err := newLangfuseFromEnv()
			if (err != nil) != tt.wantConfigError || (tracing != nil) != tt.wantTracing {
				t.Errorf("newLangfuseFromEnv() = %v, %v; want tracing %v, error %v", tracing, err, tt.wantTracing, tt.wantConfigError)
			}
		})
	}
}

func TestUnreachableLangfuseDoesNotAffectAnswer(t *testing.T) {
	down := httptest.NewServer(http.NotFoundHandler())
	tracing, err := newLangfuse(down.URL, "pk", "sk")
	if err != nil {
		t.Fatal(err)
	}
	down.Close() // nothing listens there any more
	var seen string
	upstream := modelAPI(t, http.StatusOK, `{"choices":[{"message":{"role":"assistant","content":"Hi"}}]}`, &seen)

	rec := httptest.NewRecorder()
	newHandler(upstream, "service-key", tracing).ServeHTTP(rec, chatRequest(testTraceID))
	tracing.wait()

	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Hi") {
		t.Errorf("response = %d %s, want the answer although Langfuse is down", rec.Code, rec.Body)
	}
}
