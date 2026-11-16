// Package llm talks to the LLM service (backend/cmd/llm) with the OpenAI chat completions format.
// The API only knows the Client interface, so tests use a fake and the model provider can change.
package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Message is one chat message. An assistant message either has Content or ToolCalls;
// a tool message answers the tool call with the same ToolCallID.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// ToolCall is the model's request to run a tool. Arguments is a JSON object as a string.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Tool describes a function the model may call. Parameters is a JSON schema.
type Tool struct {
	Type     string   `json:"type"`
	Function Function `json:"function"`
}

type Function struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// Request is one chat completion request.
type Request struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []Tool    `json:"tools,omitempty"`
	// TraceID groups the model calls of one question for optional tracing in the LLM service.
	// It is sent as the X-Trace-Id header, never to the model API.
	TraceID string `json:"-"`
}

// Usage counts the tokens of model calls. It stays zero when the model API does not report it.
type Usage struct {
	InputTokens  int
	OutputTokens int
}

// Add returns the sum of both usages, for example over the model calls of one question.
func (u Usage) Add(other Usage) Usage {
	return Usage{InputTokens: u.InputTokens + other.InputTokens, OutputTokens: u.OutputTokens + other.OutputTokens}
}

// Completion is the model's next message and the tokens this call used.
type Completion struct {
	Message Message
	Usage   Usage
}

// Client returns the model's next message for a conversation.
type Client interface {
	Complete(ctx context.Context, req Request) (Completion, error)
}

// ErrRateLimited means the model API refused the request because a rate limit was reached.
var ErrRateLimited = errors.New("model rate limit reached")

// ErrUnavailable means the LLM service or the model API could not answer, for example without an API key.
var ErrUnavailable = errors.New("model unavailable")

// HTTPClient calls the LLM service over HTTP.
type HTTPClient struct {
	baseURL string
	http    *http.Client
}

// requestTimeout bounds one model call; the tool loop makes several.
const requestTimeout = 60 * time.Second

// maxResponseBytes bounds how much of a model response is read.
const maxResponseBytes = 1 << 20

// NewHTTPClient returns a client for the LLM service at baseURL, for example http://llm:8080.
func NewHTTPClient(baseURL string) *HTTPClient {
	return &HTTPClient{baseURL: strings.TrimRight(baseURL, "/"), http: &http.Client{Timeout: requestTimeout}}
}

func (c *HTTPClient) Complete(ctx context.Context, req Request) (Completion, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return Completion{}, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Completion{}, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if req.TraceID != "" {
		httpReq.Header.Set("X-Trace-Id", req.TraceID)
	}

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return Completion{}, fmt.Errorf("%w: %w", ErrUnavailable, err)
	}
	defer func() { _ = resp.Body.Close() }()

	switch {
	case resp.StatusCode == http.StatusTooManyRequests:
		return Completion{}, ErrRateLimited
	case resp.StatusCode != http.StatusOK:
		// The body may echo parts of the request, so only the status is reported.
		return Completion{}, fmt.Errorf("%w: LLM service answered %d", ErrUnavailable, resp.StatusCode)
	}

	var completion struct {
		Choices []struct {
			Message Message `json:"message"`
		} `json:"choices"`
		Usage struct {
			PromptTokens     int `json:"prompt_tokens"`
			CompletionTokens int `json:"completion_tokens"`
		} `json:"usage"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxResponseBytes)).Decode(&completion); err != nil {
		return Completion{}, fmt.Errorf("%w: invalid response: %w", ErrUnavailable, err)
	}
	if len(completion.Choices) == 0 {
		return Completion{}, fmt.Errorf("%w: response has no choices", ErrUnavailable)
	}
	return Completion{
		Message: completion.Choices[0].Message,
		Usage:   Usage{InputTokens: completion.Usage.PromptTokens, OutputTokens: completion.Usage.CompletionTokens},
	}, nil
}
