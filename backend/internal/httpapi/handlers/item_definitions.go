package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// ItemDefinitionStore is implemented by the sqlc-generated queries.
type ItemDefinitionStore interface {
	CanAccessItemDefinitions(context.Context, db.CanAccessItemDefinitionsParams) (bool, error)
	ListItemDefinitions(context.Context, db.ListItemDefinitionsParams) ([]db.ItemDefinition, error)
	GetItemDefinition(context.Context, db.GetItemDefinitionParams) (db.ItemDefinition, error)
	CreateItemDefinition(context.Context, db.CreateItemDefinitionParams) (db.ItemDefinition, error)
	ReplaceItemDefinition(context.Context, db.ReplaceItemDefinitionParams) (db.ItemDefinition, error)
	PatchItemDefinition(context.Context, db.PatchItemDefinitionParams) (db.ItemDefinition, error)
	DeleteItemDefinition(context.Context, db.DeleteItemDefinitionParams) (int64, error)
}

type ItemDefinitions struct{ store ItemDefinitionStore }

func NewItemDefinitions(store ItemDefinitionStore) *ItemDefinitions {
	return &ItemDefinitions{store: store}
}

type ProjectPath struct {
	ProjectID string `path:"project_id" format:"uuid"`
}

type ItemDefinitionPath struct {
	ProjectPath
	ItemID string `path:"item_id" format:"uuid"`
}

type ListItemDefinitionsInput struct {
	ProjectPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0"`
}

type ItemDefinitionBody struct {
	Name                     string       `json:"name" minLength:"1" maxLength:"255"`
	ScopeType                db.ScopeType `json:"scope_type" enum:"ITEM,COMPONENT"`
	LifecyclePhase           *string      `json:"lifecycle_phase,omitempty" nullable:"true"`
	ItemDefinitionWP0901     *string      `json:"item_definition_wp_09_01,omitempty" nullable:"true"`
	CybersecuritySpecsWP1001 *string      `json:"cybersecurity_specs_wp_10_01,omitempty" nullable:"true"`
	ArchitecturalDesign      *string      `json:"architectural_design,omitempty" nullable:"true"`
}

type CreateItemDefinitionInput struct {
	ProjectPath
	Body ItemDefinitionBody
}
type ReplaceItemDefinitionInput struct {
	ItemDefinitionPath
	Body ItemDefinitionBody
}

// PatchText distinguishes an omitted field from an explicit JSON null.
// Null clears optional text fields; omitted fields retain their existing values.
type PatchText struct {
	Sent  bool
	Value *string
}

func (p *PatchText) UnmarshalJSON(data []byte) error {
	p.Sent = true
	return json.Unmarshal(data, &p.Value)
}

func (PatchText) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Nullable: true}
}

type PatchItemDefinitionBody struct {
	Name                     PatchText `json:"name,omitempty" nullable:"false" minLength:"1" maxLength:"255"`
	ScopeType                PatchText `json:"scope_type,omitempty" nullable:"false" enum:"ITEM,COMPONENT"`
	LifecyclePhase           PatchText `json:"lifecycle_phase,omitempty"`
	ItemDefinitionWP0901     PatchText `json:"item_definition_wp_09_01,omitempty"`
	CybersecuritySpecsWP1001 PatchText `json:"cybersecurity_specs_wp_10_01,omitempty"`
	ArchitecturalDesign      PatchText `json:"architectural_design,omitempty"`
}

type PatchItemDefinitionInput struct {
	ItemDefinitionPath
	Body PatchItemDefinitionBody
}

type ItemDefinition struct {
	ID            string `json:"id" format:"uuid"`
	TaraProjectID string `json:"tara_project_id" format:"uuid"`
	ItemDefinitionBody
	CreatedAt time.Time `json:"created_at"`
}

type ItemDefinitionOutput struct{ Body ItemDefinition }
type CreateItemDefinitionOutput struct {
	Location string `header:"Location"`
	Body     ItemDefinition
}
type ListItemDefinitionsOutput struct{ Body []ItemDefinition }

func itemDefinition(row db.ItemDefinition) ItemDefinition {
	return ItemDefinition{
		ID: row.ID.String(), TaraProjectID: row.TaraProjectID.String(), CreatedAt: row.CreatedAt.Time,
		ItemDefinitionBody: ItemDefinitionBody{
			Name: row.Name, ScopeType: row.ScopeType, LifecyclePhase: row.LifecyclePhase,
			ItemDefinitionWP0901: row.ItemDefinitionWp0901, CybersecuritySpecsWP1001: row.CybersecuritySpecsWp1001,
			ArchitecturalDesign: row.ArchitecturalDesign,
		},
	}
}

func uuid(value string) (pgtype.UUID, error) {
	var id pgtype.UUID
	if err := id.Scan(value); err != nil || !id.Valid {
		return id, huma.Error422UnprocessableEntity("invalid UUID")
	}
	return id, nil
}

func itemDefinitionError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("item definition not found")
	}
	var postgres *pgconn.PgError
	if errors.As(err, &postgres) && postgres.Code == "23503" {
		return huma.Error409Conflict("item definition has dependent records or its project no longer exists")
	}
	slog.Error("item definition database operation failed", "error", err)
	return huma.Error500InternalServerError("could not process item definition")
}

func (h *ItemDefinitions) authorize(ctx context.Context, project string, readOnly bool) (pgtype.UUID, error) {
	projectID, err := uuid(project)
	if err != nil {
		return projectID, err
	}
	userID, err := uuid(auth.UserFromContext(ctx).ID)
	if err != nil {
		return projectID, huma.Error401Unauthorized("authentication required")
	}
	allowed, err := h.store.CanAccessItemDefinitions(ctx, db.CanAccessItemDefinitionsParams{ProjectID: projectID, UserID: userID, ReadOnly: readOnly})
	if err != nil {
		return projectID, itemDefinitionError(err)
	}
	// Do not disclose whether an inaccessible project exists.
	if !allowed {
		return projectID, huma.Error404NotFound("project not found")
	}
	return projectID, nil
}

func (h *ItemDefinitions) List(ctx context.Context, in *ListItemDefinitionsInput) (*ListItemDefinitionsOutput, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, true)
	if err != nil {
		return nil, err
	}
	rows, err := h.store.ListItemDefinitions(ctx, db.ListItemDefinitionsParams{ProjectID: projectID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	out := &ListItemDefinitionsOutput{Body: make([]ItemDefinition, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, itemDefinition(row))
	}
	return out, nil
}

func (h *ItemDefinitions) Get(ctx context.Context, in *ItemDefinitionPath) (*ItemDefinitionOutput, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, true)
	if err != nil {
		return nil, err
	}
	id, err := uuid(in.ItemID)
	if err != nil {
		return nil, err
	}
	row, err := h.store.GetItemDefinition(ctx, db.GetItemDefinitionParams{ProjectID: projectID, ID: id})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &ItemDefinitionOutput{Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Create(ctx context.Context, in *CreateItemDefinitionInput) (*CreateItemDefinitionOutput, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, false)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Body.Name) == "" {
		return nil, huma.Error422UnprocessableEntity("name must not be blank")
	}
	row, err := h.store.CreateItemDefinition(ctx, db.CreateItemDefinitionParams{
		ProjectID: projectID, Name: in.Body.Name, ScopeType: in.Body.ScopeType,
		LifecyclePhase: in.Body.LifecyclePhase, ItemDefinitionWp0901: in.Body.ItemDefinitionWP0901,
		CybersecuritySpecsWp1001: in.Body.CybersecuritySpecsWP1001, ArchitecturalDesign: in.Body.ArchitecturalDesign,
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &CreateItemDefinitionOutput{Location: "/api/v1/projects/" + projectID.String() + "/item-definitions/" + row.ID.String(), Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Replace(ctx context.Context, in *ReplaceItemDefinitionInput) (*ItemDefinitionOutput, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, false)
	if err != nil {
		return nil, err
	}
	id, err := uuid(in.ItemID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Body.Name) == "" {
		return nil, huma.Error422UnprocessableEntity("name must not be blank")
	}
	row, err := h.store.ReplaceItemDefinition(ctx, db.ReplaceItemDefinitionParams{
		ProjectID: projectID, ID: id, Name: in.Body.Name, ScopeType: in.Body.ScopeType,
		LifecyclePhase: in.Body.LifecyclePhase, ItemDefinitionWp0901: in.Body.ItemDefinitionWP0901,
		CybersecuritySpecsWp1001: in.Body.CybersecuritySpecsWP1001, ArchitecturalDesign: in.Body.ArchitecturalDesign,
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &ItemDefinitionOutput{Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Patch(ctx context.Context, in *PatchItemDefinitionInput) (*ItemDefinitionOutput, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, false)
	if err != nil {
		return nil, err
	}
	id, err := uuid(in.ItemID)
	if err != nil {
		return nil, err
	}
	body := in.Body
	if body.Name.Sent && (body.Name.Value == nil || strings.TrimSpace(*body.Name.Value) == "") {
		return nil, huma.Error422UnprocessableEntity("name must not be null or blank")
	}
	var scope *db.ScopeType
	if body.ScopeType.Sent {
		if body.ScopeType.Value == nil || (*body.ScopeType.Value != "ITEM" && *body.ScopeType.Value != "COMPONENT") {
			return nil, huma.Error422UnprocessableEntity("scope_type must be ITEM or COMPONENT")
		}
		value := db.ScopeType(*body.ScopeType.Value)
		scope = &value
	}
	row, err := h.store.PatchItemDefinition(ctx, db.PatchItemDefinitionParams{
		ProjectID: projectID, ID: id, Name: body.Name.Value, ScopeType: scope,
		SetLifecyclePhase: body.LifecyclePhase.Sent, LifecyclePhase: body.LifecyclePhase.Value,
		SetItemDefinition: body.ItemDefinitionWP0901.Sent, ItemDefinitionWp0901: body.ItemDefinitionWP0901.Value,
		SetCybersecuritySpecs: body.CybersecuritySpecsWP1001.Sent, CybersecuritySpecsWp1001: body.CybersecuritySpecsWP1001.Value,
		SetArchitecturalDesign: body.ArchitecturalDesign.Sent, ArchitecturalDesign: body.ArchitecturalDesign.Value,
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &ItemDefinitionOutput{Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Delete(ctx context.Context, in *ItemDefinitionPath) (*struct{}, error) {
	projectID, err := h.authorize(ctx, in.ProjectID, false)
	if err != nil {
		return nil, err
	}
	id, err := uuid(in.ItemID)
	if err != nil {
		return nil, err
	}
	count, err := h.store.DeleteItemDefinition(ctx, db.DeleteItemDefinitionParams{ProjectID: projectID, ID: id})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	if count == 0 {
		return nil, huma.Error404NotFound("item definition not found")
	}
	return nil, nil
}

func (h *ItemDefinitions) Register(api huma.API) {
	const collection = "/api/v1/projects/{project_id}/item-definitions"
	const member = collection + "/{item_id}"
	operation := func(id, method, path, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			DefaultStatus: status, Tags: []string{"Item definitions"},
			Security: []map[string][]string{{"session": {}}}, Errors: []int{401, 404, 409, 422, 500, 503}}
	}
	huma.Register(api, operation("list-item-definitions", http.MethodGet, collection, "List item definitions", 200), h.List)
	huma.Register(api, operation("create-item-definition", http.MethodPost, collection, "Create an item definition", 201), h.Create)
	huma.Register(api, operation("get-item-definition", http.MethodGet, member, "Get an item definition", 200), h.Get)
	huma.Register(api, operation("replace-item-definition", http.MethodPut, member, "Replace an item definition", 200), h.Replace)
	huma.Register(api, operation("patch-item-definition", http.MethodPatch, member, "Update selected item definition fields", 200), h.Patch)
	huma.Register(api, operation("delete-item-definition", http.MethodDelete, member, "Delete an item definition", 204), h.Delete)
}
