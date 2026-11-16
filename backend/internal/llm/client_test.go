package llm

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCompleteSendsRequestAndReturnsMessage(t *testing.T) {
	var got Request
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path = r.URL.Path
		body, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(body, &got)
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"",
			"tool_calls":[{"id":"call_1","type":"function","function":{"name":"get_project","arguments":"{}"}}]}}],
			"usage":{"prompt_tokens":120,"completion_tokens":15,"total_tokens":135}}`)
	}))
	defer server.Close()

	completion, err := NewHTTPClient(server.URL+"/").Complete(context.Background(), Request{
		Model:    "m",
		Messages: []Message{{Role: "user", Content: "hi"}},
		Tools:    []Tool{{Type: "function", Function: Function{Name: "get_project", Parameters: map[string]any{"type": "object"}}}},
	})
	if err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if path != "/v1/chat/completions" {
		t.Errorf("path = %q, want /v1/chat/completions", path)
	}
	if got.Model != "m" || len(got.Messages) != 1 || len(got.Tools) != 1 || got.Tools[0].Function.Name != "get_project" {
		t.Errorf("request = %+v, want model, message and tool passed on", got)
	}
	msg := completion.Message
	if len(msg.ToolCalls) != 1 || msg.ToolCalls[0].ID != "call_1" || msg.ToolCalls[0].Function.Name != "get_project" {
		t.Errorf("message = %+v, want the tool call", msg)
	}
	if want := (Usage{InputTokens: 120, OutputTokens: 15}); completion.Usage != want {
		t.Errorf("usage = %+v, want %+v", completion.Usage, want)
	}
}

func TestCompleteWithoutUsage(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = io.WriteString(w, `{"choices":[{"message":{"role":"assistant","content":"Hi"}}]}`)
	}))
	defer server.Close()

	completion, err := NewHTTPClient(server.URL).Complete(context.Background(), Request{Model: "m"})
	if err != nil {
		t.Fatalf("Complete() error = %v", err)
	}
	if completion.Message.Content != "Hi" || completion.Usage != (Usage{}) {
		t.Errorf("completion = %+v, want the answer and zero usage", completion)
	}
}

func TestCompleteMapsErrors(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"rate limit", http.StatusTooManyRequests, ``, ErrRateLimited},
		{"service not configured", http.StatusServiceUnavailable, `assistant is not configured`, ErrUnavailable},
		{"model API down", http.StatusBadGateway, ``, ErrUnavailable},
		{"invalid JSON", http.StatusOK, `not json`, ErrUnavailable},
		{"no choices", http.StatusOK, `{"choices":[]}`, ErrUnavailable},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(tt.status)
				_, _ = io.WriteString(w, tt.body)
			}))
			defer server.Close()

			_, err := NewHTTPClient(server.URL).Complete(context.Background(), Request{Model: "m"})
			if !errors.Is(err, tt.want) {
				t.Errorf("error = %v, want %v", err, tt.want)
			}
		})
	}
}

func TestCompleteUnreachableService(t *testing.T) {
	server := httptest.NewServer(http.NotFoundHandler())
	url := server.URL
	server.Close()

	if _, err := NewHTTPClient(url).Complete(context.Background(), Request{Model: "m"}); !errors.Is(err, ErrUnavailable) {
		t.Errorf("error = %v, want ErrUnavailable", err)
	}
}
