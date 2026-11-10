package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type AttackPathStore interface {
	CreateAttackPath(context.Context, db.CreateAttackPathParams) (db.AttackPath, error)
	GetAttackPath(context.Context, db.GetAttackPathParams) (db.AttackPath, error)
	ListAttackPaths(context.Context, db.ListAttackPathsParams) ([]db.AttackPath, error)
	ReplaceAttackPath(context.Context, db.ReplaceAttackPathParams) (db.AttackPath, error)
	UpdateAttackPath(context.Context, db.UpdateAttackPathParams) (db.AttackPath, error)
	DeleteAttackPath(context.Context, db.DeleteAttackPathParams) (int64, error)
}

type AttackPath struct {
	store  AttackPathStore
	access ProjectAccessStore
}

func NewAttackPath(store AttackPathStore, access ProjectAccessStore) *AttackPath {
	return &AttackPath{store: store, access: access}
}

func (h *AttackPath) Register(api huma.API) {
	const collection = itemPath + "/attack-paths"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Attack Path", Description: "Create, read, replace, update and delete attack paths, their feasibility ratings and threat links.",
	})
	op := func(id, method, path, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Attack Path"}, Security: []map[string][]string{{"bearer": {}}},
			DefaultStatus: status, Errors: []int{http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity}}
	}
	read := InProject(h.access, ScopeItemDefinition, PermRead)
	edit := InProject(h.access, ScopeItemDefinition, PermEdit)
	Register(api, op("list-attack-paths", http.MethodGet, collection, "List attack paths of an item (paginated)", http.StatusOK), read, h.List)
	Register(api, op("create-attack-path", http.MethodPost, collection, "Create an attack path", http.StatusCreated), edit, h.Create)
	Register(api, op("get-attack-path", http.MethodGet, member, "Get an attack path", http.StatusOK), read, h.Get)
	Register(api, op("replace-attack-path", http.MethodPut, member, "Replace an attack path", http.StatusOK), edit, h.Replace)
	patch := op("update-attack-path", http.MethodPatch, member, "Partially update an attack path", http.StatusOK)
	patch.Description = "Omitted fields remain unchanged. analysis_approach and attack_steps_and_weaknesses can be cleared with null."
	Register(api, patch, edit, h.Update)
	Register(api, op("delete-attack-path", http.MethodDelete, member, "Delete an attack path", http.StatusNoContent), edit, h.Delete)
}

const itemPath = "/api/v1/item-definitions/{item_definition_id}"

type AttackPathBody struct {
	ID                       string               `json:"id" format:"uuid"`
	ItemDefinitionID         string               `json:"item_definition_id" format:"uuid"`
	Title                    string               `json:"title"`
	AnalysisApproach         *db.AnalysisApproach `json:"analysis_approach,omitempty" enum:"TOP_DOWN,BOTTOM_UP"`
	IsPartialEarlyStage      bool                 `json:"is_partial_early_stage"`
	AttackStepsAndWeaknesses json.RawMessage      `json:"attack_steps_and_weaknesses,omitempty"`
}

type AttackPathOutput struct {
	Body AttackPathBody
}

type CreateAttackPathOutput struct {
	Location string `header:"Location"`
	Body     AttackPathBody
}

type AttackPathListOutput struct {
	Body []AttackPathBody
}

type AttackPathParentPath struct {
	ItemDefinitionID string `path:"item_definition_id" format:"uuid"`
}

type ListAttackPathsInput struct {
	AttackPathParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type AttackPathIDInput struct {
	AttackPathParentPath
	ID string `path:"id" format:"uuid"`
}

type AttackPathInputBody struct {
	Title                    string               `json:"title" minLength:"1"`
	AnalysisApproach         *db.AnalysisApproach `json:"analysis_approach,omitempty" enum:"TOP_DOWN,BOTTOM_UP"`
	IsPartialEarlyStage      *bool                `json:"is_partial_early_stage,omitempty"`
	AttackStepsAndWeaknesses json.RawMessage      `json:"attack_steps_and_weaknesses,omitempty"`
}

type CreateAttackPathInput struct {
	AttackPathParentPath
	Body AttackPathInputBody
}

type ReplaceAttackPathInput struct {
	AttackPathIDInput
	Body AttackPathInputBody
}

// OptionalJSON is Optional for arbitrary JSON. The schema stays "any" because it already allows null.
type OptionalJSON struct {
	Optional[json.RawMessage]
}

func (OptionalJSON) Schema(huma.Registry) *huma.Schema { return &huma.Schema{} }

type UpdateAttackPathInput struct {
	AttackPathIDInput
	Body struct {
		Title                    *string                       `json:"title,omitempty" minLength:"1"`
		AnalysisApproach         Optional[db.AnalysisApproach] `json:"analysis_approach,omitempty" enum:"TOP_DOWN,BOTTOM_UP"`
		IsPartialEarlyStage      *bool                         `json:"is_partial_early_stage,omitempty"`
		AttackStepsAndWeaknesses OptionalJSON                  `json:"attack_steps_and_weaknesses,omitempty"`
	}
}

func (h *AttackPath) Create(ctx context.Context, in *CreateAttackPathInput) (*CreateAttackPathOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	p, err := h.store.CreateAttackPath(ctx, attackPathParams(itemID, in.Body))
	if err != nil {
		return nil, mapAttackPathError(err)
	}
	return &CreateAttackPathOutput{
		Location: "/api/v1/item-definitions/" + in.ItemDefinitionID + "/attack-paths/" + p.ID.String(),
		Body:     toAttackPathBody(p),
	}, nil
}

func (h *AttackPath) List(ctx context.Context, in *ListAttackPathsInput) (*AttackPathListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	paths, err := h.store.ListAttackPaths(ctx, db.ListAttackPathsParams{ItemDefinitionID: itemID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, err
	}
	out := &AttackPathListOutput{Body: make([]AttackPathBody, 0, len(paths))}
	for _, p := range paths {
		out.Body = append(out.Body, toAttackPathBody(p))
	}
	return out, nil
}

func (h *AttackPath) Get(ctx context.Context, in *AttackPathIDInput) (*AttackPathOutput, error) {
	id, itemID, err := attackPathIDs(in.ID, in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	p, err := h.store.GetAttackPath(ctx, db.GetAttackPathParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, mapAttackPathError(err)
	}
	return toAttackPathOutput(p), nil
}

func (h *AttackPath) Replace(ctx context.Context, in *ReplaceAttackPathInput) (*AttackPathOutput, error) {
	id, itemID, err := attackPathIDs(in.ID, in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	created := attackPathParams(itemID, in.Body)
	p, err := h.store.ReplaceAttackPath(ctx, db.ReplaceAttackPathParams{
		ID:                       id,
		ItemDefinitionID:         itemID,
		Title:                    created.Title,
		AnalysisApproach:         created.AnalysisApproach,
		IsPartialEarlyStage:      created.IsPartialEarlyStage,
		AttackStepsAndWeaknesses: created.AttackStepsAndWeaknesses,
	})
	if err != nil {
		return nil, mapAttackPathError(err)
	}
	return toAttackPathOutput(p), nil
}

func (h *AttackPath) Update(ctx context.Context, in *UpdateAttackPathInput) (*AttackPathOutput, error) {
	id, itemID, err := attackPathIDs(in.ID, in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	params := db.UpdateAttackPathParams{ID: id, ItemDefinitionID: itemID, Title: in.Body.Title}
	params.SetAnalysisApproach = in.Body.AnalysisApproach.Set
	params.AnalysisApproach = in.Body.AnalysisApproach.Value
	params.IsPartialEarlyStage = in.Body.IsPartialEarlyStage
	params.SetAttackStepsAndWeaknesses = in.Body.AttackStepsAndWeaknesses.Set
	if v := in.Body.AttackStepsAndWeaknesses.Value; v != nil {
		params.AttackStepsAndWeaknesses = *v
	}
	p, err := h.store.UpdateAttackPath(ctx, params)
	if err != nil {
		return nil, mapAttackPathError(err)
	}
	return toAttackPathOutput(p), nil
}

func (h *AttackPath) Delete(ctx context.Context, in *AttackPathIDInput) (*struct{}, error) {
	id, itemID, err := attackPathIDs(in.ID, in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteAttackPath(ctx, db.DeleteAttackPathParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, err
	}
	if n == 0 {
		return nil, huma.Error404NotFound("attack path not found")
	}
	return nil, nil
}

func attackPathIDs(pathID, itemIDStr string) (id, itemID pgtype.UUID, err error) {
	if id, err = parseUUID(pathID); err != nil {
		return
	}
	itemID, err = parseUUID(itemIDStr)
	return
}

func attackPathParams(itemID pgtype.UUID, body AttackPathInputBody) db.CreateAttackPathParams {
	params := db.CreateAttackPathParams{
		ItemDefinitionID:         itemID,
		Title:                    body.Title,
		IsPartialEarlyStage:      body.IsPartialEarlyStage == nil || *body.IsPartialEarlyStage,
		AttackStepsAndWeaknesses: body.AttackStepsAndWeaknesses,
	}
	params.AnalysisApproach = body.AnalysisApproach
	return params
}

func mapAttackPathError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("attack path not found")
	}
	return err
}

func toAttackPathBody(p db.AttackPath) AttackPathBody {
	out := AttackPathBody{
		ID:                  p.ID.String(),
		ItemDefinitionID:    p.ItemDefinitionID.String(),
		Title:               p.Title,
		IsPartialEarlyStage: p.IsPartialEarlyStage,
	}
	out.AnalysisApproach = p.AnalysisApproach
	if len(p.AttackStepsAndWeaknesses) > 0 {
		out.AttackStepsAndWeaknesses = json.RawMessage(p.AttackStepsAndWeaknesses)
	}
	return out
}

func toAttackPathOutput(p db.AttackPath) *AttackPathOutput {
	return &AttackPathOutput{Body: toAttackPathBody(p)}
}
