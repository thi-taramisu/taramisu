package main

// Optional tracing to a self-hosted Langfuse (https://langfuse.com). When LANGFUSE_HOST and both keys are set, the
// service reports every chat completion as a Langfuse generation: request messages, the model's reply, token usage,
// duration and errors. The API sends the same X-Trace-Id with all model calls of one question, so they form one
// trace. Reports are sent in the background and never delay or fail the model request.
//
// Langfuse v4 takes traces through its OpenTelemetry endpoint, so each model call is sent as one OTLP/HTTP JSON span
// with Langfuse's span attributes (https://langfuse.com/integrations/native/opentelemetry).
//
// Langfuse stores the full prompts, including project data, so only point it at an instance you run yourself.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"
)

// traceHeader carries the trace ID from the API; it is removed before the request goes to the model API.
const traceHeader = "X-Trace-Id"

// traceIDPattern is an OpenTelemetry trace ID: 32 lowercase hex characters.
var traceIDPattern = regexp.MustCompile(`^[0-9a-f]{32}$`)

const langfuseTimeout = 5 * time.Second

// langfuse sends spans to the Langfuse OTLP endpoint. A nil *langfuse disables tracing.
type langfuse struct {
	endpoint             string
	publicKey, secretKey string
	http                 *http.Client
	pending              sync.WaitGroup
}

// newLangfuseFromEnv returns nil when tracing is not configured, and an error when it is configured incompletely.
func newLangfuseFromEnv() (*langfuse, error) {
	host := os.Getenv("LANGFUSE_HOST")
	publicKey, secretKey := os.Getenv("LANGFUSE_PUBLIC_KEY"), os.Getenv("LANGFUSE_SECRET_KEY")
	if host == "" && publicKey == "" && secretKey == "" {
		return nil, nil
	}
	if host == "" || publicKey == "" || secretKey == "" {
		return nil, fmt.Errorf("set LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY together, or none of them")
	}
	return newLangfuse(host, publicKey, secretKey)
}

func newLangfuse(host, publicKey, secretKey string) (*langfuse, error) {
	u, err := url.Parse(host)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, fmt.Errorf("invalid LANGFUSE_HOST %q", host)
	}
	return &langfuse{
		endpoint:  strings.TrimRight(host, "/") + "/api/public/otel/v1/traces",
		publicKey: publicKey, secretKey: secretKey,
		http: &http.Client{Timeout: langfuseTimeout},
	}, nil
}

// generation is one model call as the service saw it.
type generation struct {
	traceID           string
	start, end        time.Time
	status            int
	request, response []byte
}

// report sends the generation in the background; wait blocks until all reports are sent.
func (l *langfuse) report(g generation) {
	l.pending.Go(func() {
		ctx, cancel := context.WithTimeout(context.Background(), langfuseTimeout)
		defer cancel()
		if err := l.send(ctx, g); err != nil {
			// Only the error: the payload contains project data.
			slog.Warn("langfuse report failed", "error", err)
		}
	})
}

func (l *langfuse) wait() { l.pending.Wait() }

func (l *langfuse) send(ctx context.Context, g generation) error {
	body, err := json.Marshal(otlpPayload(g))
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, l.endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.SetBasicAuth(l.publicKey, l.secretKey)
	resp, err := l.http.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("langfuse answered %d", resp.StatusCode)
	}
	return nil
}

// otlpPayload turns a model call into one OTLP span of type generation. Every span names the trace and sets the
// question as its input; only the final answer (a reply without tool calls) sets the trace output.
func otlpPayload(g generation) map[string]any {
	var req struct {
		Model    string            `json:"model"`
		Messages []json.RawMessage `json:"messages"`
		Tools    []json.RawMessage `json:"tools"`
	}
	_ = json.Unmarshal(g.request, &req)
	var resp struct {
		Model   string `json:"model"`
		Choices []struct {
			Message struct {
				Content   string            `json:"content"`
				ToolCalls []json.RawMessage `json:"tool_calls"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	parsed := json.Unmarshal(g.response, &resp) == nil && len(resp.Choices) > 0

	attrs := map[string]string{
		"langfuse.observation.type":       "generation",
		"langfuse.trace.name":             "assistant question",
		"langfuse.observation.model.name": req.Model,
		"langfuse.observation.input":      jsonString(map[string]any{"messages": req.Messages, "tools": req.Tools}),
	}
	if question := lastUserMessage(req.Messages); question != "" {
		attrs["langfuse.trace.input"] = question
	}
	status := map[string]any{"code": 1} // OK
	switch {
	case g.status != http.StatusOK:
		message := fmt.Sprintf("model API answered %d", g.status)
		attrs["langfuse.observation.level"] = "ERROR"
		attrs["langfuse.observation.status_message"] = message
		status = map[string]any{"code": 2, "message": message}
	case parsed:
		message := resp.Choices[0].Message
		if resp.Model != "" {
			attrs["langfuse.observation.model.name"] = resp.Model
		}
		if len(message.ToolCalls) > 0 {
			attrs["langfuse.observation.output"] = jsonString(map[string]any{"tool_calls": message.ToolCalls})
		} else {
			attrs["langfuse.observation.output"] = message.Content
			attrs["langfuse.trace.output"] = message.Content
		}
		attrs["langfuse.observation.usage_details"] = jsonString(map[string]int{
			"input": resp.Usage.PromptTokens, "output": resp.Usage.CompletionTokens,
		})
	}

	return map[string]any{"resourceSpans": []any{map[string]any{
		"resource": map[string]any{"attributes": otlpAttributes(map[string]string{"service.name": "taramisu-llm"})},
		"scopeSpans": []any{map[string]any{
			"scope": map[string]any{"name": "taramisu-llm"},
			"spans": []any{map[string]any{
				"traceId": g.traceID, "spanId": randomHex(8), "name": "chat completion",
				"kind":              3, // client
				"startTimeUnixNano": strconv.FormatInt(g.start.UnixNano(), 10),
				"endTimeUnixNano":   strconv.FormatInt(g.end.UnixNano(), 10),
				"attributes":        otlpAttributes(attrs),
				"status":            status,
			}},
		}},
	}}}
}

// otlpAttributes converts string attributes to the OTLP JSON form, sorted by key for stable output.
func otlpAttributes(attrs map[string]string) []map[string]any {
	keys := make([]string, 0, len(attrs))
	for key := range attrs {
		keys = append(keys, key)
	}
	slices.Sort(keys)
	out := make([]map[string]any, 0, len(keys))
	for _, key := range keys {
		out = append(out, map[string]any{"key": key, "value": map[string]any{"stringValue": attrs[key]}})
	}
	return out
}

func jsonString(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// lastUserMessage returns the content of the last user message, the question this trace is about.
func lastUserMessage(messages []json.RawMessage) string {
	for _, raw := range slices.Backward(messages) {
		var m struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}
		if json.Unmarshal(raw, &m) == nil && m.Role == "user" {
			return m.Content
		}
	}
	return ""
}

// traceIDFrom returns the API's trace ID, or a new one for a request without a valid ID.
func traceIDFrom(r *http.Request) string {
	if id := r.Header.Get(traceHeader); traceIDPattern.MatchString(id) {
		return id
	}
	return randomHex(16)
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
