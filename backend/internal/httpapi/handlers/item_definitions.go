package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

// ItemDefinitionStore is implemented by db.Store. Changes run inside Audit.
type ItemDefinitionStore interface {
	Auditor
	ListItemDefinitions(context.Context, db.ListItemDefinitionsParams) ([]db.ItemDefinition, error)
	GetItemDefinition(context.Context, db.GetItemDefinitionParams) (db.ItemDefinition, error)
	GetItemDefinitionForUpdate(context.Context, db.GetItemDefinitionForUpdateParams) (db.ItemDefinition, error)
	GetItemDefinitionForDelete(context.Context, db.GetItemDefinitionForDeleteParams) (db.ItemDefinition, error)
	CreateItemDefinition(context.Context, db.CreateItemDefinitionParams) (db.ItemDefinition, error)
	ReplaceItemDefinition(context.Context, db.ReplaceItemDefinitionParams) (db.ItemDefinition, error)
	PatchItemDefinition(context.Context, db.PatchItemDefinitionParams) (db.ItemDefinition, error)
	DeleteItemDefinition(context.Context, db.DeleteItemDefinitionParams) (int64, error)
}

type ItemDefinitions struct {
	store  ItemDefinitionStore
	access ProjectAccessStore
}

func NewItemDefinitions(store ItemDefinitionStore, access ProjectAccessStore) *ItemDefinitions {
	return &ItemDefinitions{store: store, access: access}
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
	Boundary                 *string      `json:"boundary,omitempty" nullable:"true"`
	Functions                *string      `json:"functions,omitempty" nullable:"true"`
	OperationalEnvironment   *string      `json:"operational_environment,omitempty" nullable:"true"`
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

type PatchItemDefinitionBody struct {
	Name                     Optional[string] `json:"name,omitempty" nullable:"false" minLength:"1" maxLength:"255"`
	ScopeType                Optional[string] `json:"scope_type,omitempty" nullable:"false" enum:"ITEM,COMPONENT"`
	Boundary                 Optional[string] `json:"boundary,omitempty"`
	Functions                Optional[string] `json:"functions,omitempty"`
	OperationalEnvironment   Optional[string] `json:"operational_environment,omitempty"`
	LifecyclePhase           Optional[string] `json:"lifecycle_phase,omitempty"`
	ItemDefinitionWP0901     Optional[string] `json:"item_definition_wp_09_01,omitempty"`
	CybersecuritySpecsWP1001 Optional[string] `json:"cybersecurity_specs_wp_10_01,omitempty"`
	ArchitecturalDesign      Optional[string] `json:"architectural_design,omitempty"`
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
			Boundary: row.Boundary, Functions: row.Functions, OperationalEnvironment: row.OperationalEnvironment,
			ItemDefinitionWP0901: row.ItemDefinitionWp0901, CybersecuritySpecsWP1001: row.CybersecuritySpecsWp1001,
			ArchitecturalDesign: row.ArchitecturalDesign,
		},
	}
}

func itemDefinitionError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("item definition not found")
	}
	var postgres *pgconn.PgError
	if errors.As(err, &postgres) && postgres.Code == "23503" {
		return huma.Error409Conflict("item definition has dependent records or its project no longer exists")
	}
	return err // handlers.Register logs it with the request ID and answers with a plain 500
}

func (h *ItemDefinitions) List(ctx context.Context, in *ListItemDefinitionsInput) (*ListItemDefinitionsOutput, error) {
	projectID := projectIDFromContext(ctx)
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
	projectID := projectIDFromContext(ctx)
	id, err := parseUUID(in.ItemID)
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
	projectID := projectIDFromContext(ctx)
	if strings.TrimSpace(in.Body.Name) == "" {
		return nil, huma.Error422UnprocessableEntity("name must not be blank")
	}
	var row db.ItemDefinition
	err := audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		var err error
		row, err = h.store.CreateItemDefinition(ctx, db.CreateItemDefinitionParams{
			ProjectID: projectID, Name: in.Body.Name, ScopeType: in.Body.ScopeType,
			Boundary: in.Body.Boundary, Functions: in.Body.Functions, OperationalEnvironment: in.Body.OperationalEnvironment,
			LifecyclePhase: in.Body.LifecyclePhase, ItemDefinitionWp0901: in.Body.ItemDefinitionWP0901,
			CybersecuritySpecsWp1001: in.Body.CybersecuritySpecsWP1001, ArchitecturalDesign: in.Body.ArchitecturalDesign,
		})
		if err != nil {
			return db.Change{}, err
		}
		return db.Created(db.TargetItemDefinition, projectID, row.ID, itemDefinition(row)), nil
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &CreateItemDefinitionOutput{Location: "/api/v1/projects/" + projectID.String() + "/item-definitions/" + row.ID.String(), Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Replace(ctx context.Context, in *ReplaceItemDefinitionInput) (*ItemDefinitionOutput, error) {
	projectID := projectIDFromContext(ctx)
	id, err := parseUUID(in.ItemID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(in.Body.Name) == "" {
		return nil, huma.Error422UnprocessableEntity("name must not be blank")
	}
	return h.update(ctx, projectID, id, func(ctx context.Context) (db.ItemDefinition, error) {
		return h.store.ReplaceItemDefinition(ctx, db.ReplaceItemDefinitionParams{
			ProjectID: projectID, ID: id, Name: in.Body.Name, ScopeType: in.Body.ScopeType,
			Boundary: in.Body.Boundary, Functions: in.Body.Functions, OperationalEnvironment: in.Body.OperationalEnvironment,
			LifecyclePhase: in.Body.LifecyclePhase, ItemDefinitionWp0901: in.Body.ItemDefinitionWP0901,
			CybersecuritySpecsWp1001: in.Body.CybersecuritySpecsWP1001, ArchitecturalDesign: in.Body.ArchitecturalDesign,
		})
	})
}

// update runs change on the item definition and records item_definition.updated, unless nothing
// changed.
func (h *ItemDefinitions) update(ctx context.Context, projectID, id pgtype.UUID, change func(context.Context) (db.ItemDefinition, error)) (*ItemDefinitionOutput, error) {
	var row db.ItemDefinition
	err := audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetItemDefinitionForUpdate(ctx, db.GetItemDefinitionForUpdateParams{ProjectID: projectID, ID: id})
		if err != nil {
			return db.Change{}, err
		}
		if row, err = change(ctx); err != nil {
			return db.Change{}, err
		}
		return db.Updated(db.TargetItemDefinition, projectID, id, itemDefinition(before), itemDefinition(row)), nil
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return &ItemDefinitionOutput{Body: itemDefinition(row)}, nil
}

func (h *ItemDefinitions) Patch(ctx context.Context, in *PatchItemDefinitionInput) (*ItemDefinitionOutput, error) {
	projectID := projectIDFromContext(ctx)
	id, err := parseUUID(in.ItemID)
	if err != nil {
		return nil, err
	}
	body := in.Body
	if body.Name.Set && (body.Name.Value == nil || strings.TrimSpace(*body.Name.Value) == "") {
		return nil, huma.Error422UnprocessableEntity("name must not be null or blank")
	}
	var scope *db.ScopeType
	if body.ScopeType.Set {
		if body.ScopeType.Value == nil || (*body.ScopeType.Value != "ITEM" && *body.ScopeType.Value != "COMPONENT") {
			return nil, huma.Error422UnprocessableEntity("scope_type must be ITEM or COMPONENT")
		}
		value := db.ScopeType(*body.ScopeType.Value)
		scope = &value
	}
	return h.update(ctx, projectID, id, func(ctx context.Context) (db.ItemDefinition, error) {
		return h.store.PatchItemDefinition(ctx, db.PatchItemDefinitionParams{
			ProjectID: projectID, ID: id, Name: body.Name.Value, ScopeType: scope,
			SetBoundary: body.Boundary.Set, Boundary: body.Boundary.Value,
			SetFunctions: body.Functions.Set, Functions: body.Functions.Value,
			SetOperationalEnvironment: body.OperationalEnvironment.Set, OperationalEnvironment: body.OperationalEnvironment.Value,
			SetLifecyclePhase: body.LifecyclePhase.Set, LifecyclePhase: body.LifecyclePhase.Value,
			SetItemDefinition: body.ItemDefinitionWP0901.Set, ItemDefinitionWp0901: body.ItemDefinitionWP0901.Value,
			SetCybersecuritySpecs: body.CybersecuritySpecsWP1001.Set, CybersecuritySpecsWp1001: body.CybersecuritySpecsWP1001.Value,
			SetArchitecturalDesign: body.ArchitecturalDesign.Set, ArchitecturalDesign: body.ArchitecturalDesign.Value,
		})
	})
}

func (h *ItemDefinitions) Delete(ctx context.Context, in *ItemDefinitionPath) (*struct{}, error) {
	projectID := projectIDFromContext(ctx)
	id, err := parseUUID(in.ItemID)
	if err != nil {
		return nil, err
	}
	err = audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetItemDefinitionForDelete(ctx, db.GetItemDefinitionForDeleteParams{ProjectID: projectID, ID: id})
		if err != nil {
			return db.Change{}, err
		}
		count, err := h.store.DeleteItemDefinition(ctx, db.DeleteItemDefinitionParams{ProjectID: projectID, ID: id})
		if err != nil {
			return db.Change{}, err
		}
		if count == 0 {
			return db.Change{}, pgx.ErrNoRows
		}
		return db.Deleted(db.TargetItemDefinition, projectID, id, itemDefinition(before)), nil
	})
	if err != nil {
		return nil, itemDefinitionError(err)
	}
	return nil, nil
}

func (h *ItemDefinitions) Register(api huma.API) {
	const collection = "/api/v1/projects/{project_id}/item-definitions"
	const member = collection + "/{item_id}"
	operation := func(id, method, path, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			DefaultStatus: status, Tags: []string{"Item definitions"},
			Security: []map[string][]string{{"bearer": {}}}, Errors: []int{401, 404, 409, 422, 500, 503}}
	}
	Register(api, operation("list-item-definitions", http.MethodGet, collection, "List item definitions", 200), InProject(h.access, ScopeProject("project_id"), PermRead), h.List)
	Register(api, operation("create-item-definition", http.MethodPost, collection, "Create an item definition", 201), InProject(h.access, ScopeProject("project_id"), PermEdit), h.Create)
	Register(api, operation("get-item-definition", http.MethodGet, member, "Get an item definition", 200), InProject(h.access, ScopeProject("project_id"), PermRead), h.Get)
	Register(api, operation("replace-item-definition", http.MethodPut, member, "Replace an item definition", 200), InProject(h.access, ScopeProject("project_id"), PermEdit), h.Replace)
	Register(api, operation("update-item-definition", http.MethodPatch, member, "Update selected item definition fields", 200), InProject(h.access, ScopeProject("project_id"), PermEdit), h.Patch)
	Register(api, operation("delete-item-definition", http.MethodDelete, member, "Delete an item definition", 204), InProject(h.access, ScopeProject("project_id"), PermEdit), h.Delete)
}
