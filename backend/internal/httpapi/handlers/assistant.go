package handlers

// AI assistant prototype (#229). The API runs the tool loop: the model asks for a tool, the API runs it and sends
// the result back, until the model answers. Tools only read the project from the URL, which the access check has
// already authorized, so the model cannot reach other projects: no tool takes a project ID.

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
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

// AssistantStore is the read access the assistant's tools need; it is implemented by the sqlc-generated queries.
type AssistantStore interface {
	GetTaraProject(context.Context, pgtype.UUID) (db.TaraProject, error)
	ListItemDefinitions(context.Context, db.ListItemDefinitionsParams) ([]db.ItemDefinition, error)
}

type Assistant struct {
	store  AssistantStore
	access ProjectAccessStore
	client llm.Client
	model  string
}

// NewAssistant returns the assistant handler. Without a client, every question gets 503.
func NewAssistant(store AssistantStore, access ProjectAccessStore, client llm.Client, model string) *Assistant {
	return &Assistant{store: store, access: access, client: client, model: model}
}

type AssistantMessage struct {
	Role    string `json:"role" enum:"user,assistant"`
	Content string `json:"content" minLength:"1" maxLength:"4000"`
}

type AssistantInput struct {
	ProjectPath
	Body struct {
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
	result, err := runToolLoop(ctx, h.client, h.model, messages, h.tools(projectIDFromContext(ctx)))
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

// tools returns the tools bound to the authorized project.
func (h *Assistant) tools(projectID pgtype.UUID) map[string]assistantTool {
	return map[string]assistantTool{
		"get_project": {
			description: "Returns the current TARA project: name and description.",
			run: func(ctx context.Context) (any, error) {
				p, err := h.store.GetTaraProject(ctx, projectID)
				if err != nil {
					return nil, err
				}
				return map[string]any{"name": p.Name, "description": p.Description}, nil
			},
		},
		"list_item_definitions": {
			description: "Lists the item definitions of the current project (items and components with boundary, " +
				"functions, operational environment and lifecycle phase).",
			run: func(ctx context.Context) (any, error) {
				rows, err := h.store.ListItemDefinitions(ctx, db.ListItemDefinitionsParams{ProjectID: projectID, PageLimit: maxToolItems})
				if err != nil {
					return nil, err
				}
				items := make([]ItemDefinitionBody, 0, len(rows))
				for _, row := range rows {
					items = append(items, itemDefinition(row).ItemDefinitionBody)
				}
				return items, nil
			},
		},
	}
}

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
	switch {
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
