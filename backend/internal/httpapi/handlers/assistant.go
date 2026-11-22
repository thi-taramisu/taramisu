package handlers

// AI assistant prototype (#229). The API runs the tool loop: the model asks for a tool, the API runs it and sends
// the result back, until the model answers.
//
// A tool is a GET route of this API. The API sends the request to its own router with the caller's token, so a
// tool passes the same authentication and access check as a request from the browser and the assistant needs no
// database access of its own. The routes are fixed to the project from the URL and no tool takes parameters, so
// the model cannot reach other projects.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/llm"
)

// maxToolRounds bounds the model calls per question, so a model that keeps asking for tools stops.
const maxToolRounds = 5

// maxToolItems bounds how many records a list tool sends to the model.
const maxToolItems = 100

const assistantSystemPrompt = `You are the assistant of Taramisu, a tool for threat analysis and risk assessment (TARA)
according to ISO/SAE 21434. Answer questions about the current project. Use the tools to read project data and
never invent data that the tools did not return. You can only read; if the user asks you to change something,
explain how to do it in the tool. Never mention tool or function names; when asked what you can do, describe it in
plain words, for example that you can read the project's name and description and list its item definitions.
Answer in the language of the user's last message.`

type Assistant struct {
	access ProjectAccessStore
	routes http.Handler
	client llm.Client
	model  string
}

// NewAssistant returns the assistant handler. routes serves this API's routes; the tools read through it.
// Without a client, every question gets 503.
func NewAssistant(access ProjectAccessStore, routes http.Handler, client llm.Client, model string) *Assistant {
	return &Assistant{access: access, routes: routes, client: client, model: model}
}

type AssistantMessage struct {
	Role    string `json:"role" enum:"user,assistant"`
	Content string `json:"content" minLength:"1" maxLength:"4000"`
}

type AssistantInput struct {
	ProjectPath
	// Authorization is the caller's bearer token, which the tools send along when they call this API's routes.
	// It is hidden because the operation's security scheme already documents it.
	Authorization string `header:"Authorization" hidden:"true"`
	Body          struct {
		// Messages is the conversation so far; the last one is the new question.
		Messages []AssistantMessage `json:"messages" minItems:"1" maxItems:"20"`
	}
}

type AssistantOutput struct {
	Body struct {
		Answer string `json:"answer"`
		// ToolsUsed lists the tools the model called, so the user can see where the answer comes from.
		ToolsUsed []string `json:"tools_used"`
		// Usage sums the tokens of all model calls for this question, so the cost of a question is visible.
		Usage AssistantUsage `json:"usage"`
	}
}

// AssistantUsage counts tokens as reported by the model API; zero when it reports none.
type AssistantUsage struct {
	InputTokens  int `json:"input_tokens"`
	OutputTokens int `json:"output_tokens"`
}

func (h *Assistant) Register(api huma.API) {
	Register(api, huma.Operation{
		OperationID: "ask-assistant", Method: http.MethodPost, Path: "/api/v1/projects/{project_id}/assistant",
		Summary:     "Ask the AI assistant about a project (prototype)",
		Description: "Read-only. The assistant reads the project through tools and answers; nothing is stored.",
		Tags:        []string{"Assistant"}, Security: []map[string][]string{{"bearer": {}}},
		Errors: []int{401, 422, 429, 500, 502, 503},
	}, InProject(h.access, ScopeProject("project_id"), PermRead), h.Ask)
}

func (h *Assistant) Ask(ctx context.Context, in *AssistantInput) (*AssistantOutput, error) {
	if h.client == nil {
		return nil, huma.Error503ServiceUnavailable("assistant is not configured")
	}
	if last := in.Body.Messages[len(in.Body.Messages)-1]; last.Role != "user" {
		return nil, huma.Error422UnprocessableEntity("the last message must be from the user")
	}

	messages := []llm.Message{{Role: "system", Content: assistantSystemPrompt}}
	for _, m := range in.Body.Messages {
		messages = append(messages, llm.Message{Role: m.Role, Content: m.Content})
	}
	tools := h.tools(projectIDFromContext(ctx), in.Authorization)
	result, err := runToolLoop(ctx, h.client, h.model, messages, tools)
	if err != nil {
		return nil, assistantError(err)
	}
	out := &AssistantOutput{}
	out.Body.Answer, out.Body.ToolsUsed = result.answer, result.toolsUsed
	out.Body.Usage = AssistantUsage{InputTokens: result.usage.InputTokens, OutputTokens: result.usage.OutputTokens}
	return out, nil
}

// assistantTool is a read-only function the model may call. It has no parameters on purpose.
type assistantTool struct {
	description string
	run         func(context.Context) (any, error)
}

// tools returns the tools bound to the authorized project. Each one reads a route of this API as the caller.
func (h *Assistant) tools(projectID pgtype.UUID, authorization string) map[string]assistantTool {
	project := "/api/v1/projects/" + projectID.String()
	return map[string]assistantTool{
		"get_project": {
			description: "Returns the current TARA project: name, description and the user's role in it.",
			run:         h.route(authorization, project),
		},
		"list_item_definitions": {
			description: "Lists the item definitions of the current project (items and components with boundary, " +
				"functions, operational environment and lifecycle phase).",
			run: h.route(authorization, project+"/item-definitions?limit="+strconv.Itoa(maxToolItems)),
		},
	}
}

// route returns a tool that reads path with a GET request to this API's own router and passes the route's JSON
// on to the model. The request carries the caller's token, so the route authenticates and authorizes it like a
// request from outside.
func (h *Assistant) route(authorization, path string) func(context.Context) (any, error) {
	return func(ctx context.Context) (any, error) {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, path, http.NoBody)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", authorization)
		res := &routeResponse{header: http.Header{}}
		h.routes.ServeHTTP(res, req)

		switch res.status {
		case http.StatusOK:
			return json.RawMessage(res.body.Bytes()), nil
		case http.StatusUnauthorized, http.StatusForbidden, http.StatusNotFound:
			return nil, &routeDeniedError{status: res.status, detail: res.detail()}
		default:
			return nil, fmt.Errorf("GET %s: status %d: %s", path, res.status, res.detail())
		}
	}
}

// routeResponse collects a route's response in memory.
type routeResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (r *routeResponse) Header() http.Header { return r.header }

func (r *routeResponse) WriteHeader(status int) {
	if r.status == 0 {
		r.status = status
	}
}

func (r *routeResponse) Write(p []byte) (int, error) {
	r.WriteHeader(http.StatusOK)
	return r.body.Write(p)
}

// detail returns the message of an error response (RFC 9457 problem details).
func (r *routeResponse) detail() string {
	var problem struct {
		Detail string `json:"detail"`
	}
	if err := json.Unmarshal(r.body.Bytes(), &problem); err != nil || problem.Detail == "" {
		return http.StatusText(r.status)
	}
	return problem.Detail
}

// routeDeniedError is a route refusing a tool's request: the caller's token expired or they lost access to the
// project while the model was working. The caller gets the same response as for a direct request to the route.
type routeDeniedError struct {
	status int
	detail string
}

func (e *routeDeniedError) Error() string { return fmt.Sprintf("status %d: %s", e.status, e.detail) }

var errToolRoundsExceeded = errors.New("assistant did not answer within the tool round limit")

// toolLoopResult is the model's answer, the names of the tools it used and the tokens of all model calls.
type toolLoopResult struct {
	answer    string
	toolsUsed []string
	usage     llm.Usage
}

// runToolLoop asks the model until it answers without tool calls, running the requested tools in between.
func runToolLoop(ctx context.Context, client llm.Client, model string, messages []llm.Message, tools map[string]assistantTool) (toolLoopResult, error) {
	definitions := make([]llm.Tool, 0, len(tools))
	for name, tool := range tools {
		definitions = append(definitions, llm.Tool{Type: "function", Function: llm.Function{
			Name: name, Description: tool.description,
			Parameters: map[string]any{"type": "object", "properties": map[string]any{}},
		}})
	}

	result := toolLoopResult{toolsUsed: []string{}}
	traceID := newTraceID() // one trace for all model calls of this question
	for range maxToolRounds {
		completion, err := client.Complete(ctx, llm.Request{Model: model, Messages: messages, Tools: definitions, TraceID: traceID})
		if err != nil {
			return toolLoopResult{}, err
		}
		result.usage = result.usage.Add(completion.Usage)
		reply := completion.Message
		if len(reply.ToolCalls) == 0 {
			result.answer = reply.Content
			return result, nil
		}
		messages = append(messages, reply)
		for _, call := range reply.ToolCalls {
			output, err := runTool(ctx, tools, call)
			if err != nil {
				return toolLoopResult{}, err
			}
			result.toolsUsed = append(result.toolsUsed, call.Function.Name)
			messages = append(messages, llm.Message{Role: "tool", ToolCallID: call.ID, Content: output})
		}
	}
	return toolLoopResult{}, errToolRoundsExceeded
}

// newTraceID returns 32 random hex characters, the format the LLM service accepts in X-Trace-Id.
func newTraceID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// runTool runs one tool call and returns its result as JSON. An unknown tool is reported to the model,
// which can then answer without it; a failing tool is an error of the request.
func runTool(ctx context.Context, tools map[string]assistantTool, call llm.ToolCall) (string, error) {
	tool, ok := tools[call.Function.Name]
	if !ok {
		return fmt.Sprintf(`{"error":"unknown tool %q"}`, call.Function.Name), nil
	}
	result, err := tool.run(ctx)
	if err != nil {
		return "", fmt.Errorf("tool %s: %w", call.Function.Name, err)
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("tool %s: %w", call.Function.Name, err)
	}
	return string(encoded), nil
}

func assistantError(err error) error {
	var denied *routeDeniedError
	switch {
	case errors.As(err, &denied):
		return huma.NewError(denied.status, denied.detail)
	case errors.Is(err, llm.ErrRateLimited):
		return huma.Error429TooManyRequests("the assistant is busy; try again in a few seconds")
	case errors.Is(err, llm.ErrUnavailable):
		slog.Warn("assistant model unavailable", "error", err)
		return huma.Error503ServiceUnavailable("the assistant is unavailable")
	case errors.Is(err, errToolRoundsExceeded):
		return huma.Error502BadGateway("the assistant did not finish its answer")
	default:
		slog.Error("assistant request failed", "error", err)
		return huma.Error500InternalServerError("internal server error")
	}
}
