package handlers

import (
	"context"
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type DamageScenarioStore interface {
	CreateDamageScenario(context.Context, db.CreateDamageScenarioParams) (db.DamageScenario, error)
	GetDamageScenario(context.Context, db.GetDamageScenarioParams) (db.DamageScenario, error)
	ListDamageScenarios(context.Context, db.ListDamageScenariosParams) ([]db.DamageScenario, error)
	ReplaceDamageScenario(context.Context, db.ReplaceDamageScenarioParams) (db.DamageScenario, error)
	UpdateDamageScenario(context.Context, db.UpdateDamageScenarioParams) (db.DamageScenario, error)
	DeleteDamageScenario(context.Context, db.DeleteDamageScenarioParams) (int64, error)
}

type DamageScenario struct {
	store DamageScenarioStore
}

func NewDamageScenario(store DamageScenarioStore) *DamageScenario {
	return &DamageScenario{store: store}
}

func (h *DamageScenario) Register(api huma.API) {
	const collection = "/api/v1/item-definitions/{item_definition_id}/damage-scenarios"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Damage Scenario", Description: "Create, read, replace, update and delete damage scenarios of an item definition.",
	})
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Damage Scenario"}, Security: []map[string][]string{{"bearer": {}}}}
	}
	huma.Register(api, op("list-damage-scenarios", http.MethodGet, collection, "List damage scenarios of an item definition (paginated)"), h.List)
	create := op("create-damage-scenario", http.MethodPost, collection, "Create a damage scenario")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	huma.Register(api, op("get-damage-scenario", http.MethodGet, member, "Get a damage scenario"), h.Get)
	huma.Register(api, op("replace-damage-scenario", http.MethodPut, member, "Replace a damage scenario"), h.Replace)
	huma.Register(api, op("update-damage-scenario", http.MethodPatch, member, "Partially update a damage scenario"), h.Update)
	del := op("delete-damage-scenario", http.MethodDelete, member, "Delete a damage scenario with its impact ratings and links")
	del.DefaultStatus = http.StatusNoContent
	huma.Register(api, del, h.Delete)
}

type DamageScenarioBody struct {
	ID                           string  `json:"id" format:"uuid"`
	ItemDefinitionID             string  `json:"item_definition_id" format:"uuid"`
	Title                        string  `json:"title"`
	FunctionalityAdverseRelation *string `json:"functionality_adverse_relation,omitempty"`
	RoadUserHarmDescription      *string `json:"road_user_harm_description,omitempty"`
}

type DamageScenarioOutput struct {
	Body DamageScenarioBody
}

type DamageScenarioListOutput struct {
	Body []DamageScenarioBody
}

type DamageScenarioParent struct {
	ItemDefinitionID string `path:"item_definition_id" format:"uuid"`
}

type ListDamageScenariosInput struct {
	DamageScenarioParent
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type DamageScenarioIDInput struct {
	DamageScenarioParent
	ID string `path:"id" format:"uuid"`
}

type DamageScenarioFields struct {
	Title                        string  `json:"title" minLength:"1" pattern:"\\S"`
	FunctionalityAdverseRelation *string `json:"functionality_adverse_relation,omitempty"`
	RoadUserHarmDescription      *string `json:"road_user_harm_description,omitempty"`
}

type CreateDamageScenarioInput struct {
	DamageScenarioParent
	Body DamageScenarioFields
}

type ReplaceDamageScenarioInput struct {
	DamageScenarioIDInput
	Body DamageScenarioFields
}

type UpdateDamageScenarioInput struct {
	DamageScenarioIDInput
	Body struct {
		Title                        *string          `json:"title,omitempty" minLength:"1" pattern:"\\S"`
		FunctionalityAdverseRelation Optional[string] `json:"functionality_adverse_relation,omitempty"`
		RoadUserHarmDescription      Optional[string] `json:"road_user_harm_description,omitempty"`
	}
}

func (h *DamageScenario) Create(ctx context.Context, in *CreateDamageScenarioInput) (*DamageScenarioOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	d, err := h.store.CreateDamageScenario(ctx, db.CreateDamageScenarioParams{
		ItemDefinitionID:             itemID,
		Title:                        in.Body.Title,
		FunctionalityAdverseRelation: in.Body.FunctionalityAdverseRelation,
		RoadUserHarmDescription:      in.Body.RoadUserHarmDescription,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, huma.Error404NotFound("item definition not found")
	}
	if err != nil {
		return nil, err
	}
	return toDamageScenarioOutput(d), nil
}

func (h *DamageScenario) List(ctx context.Context, in *ListDamageScenariosInput) (*DamageScenarioListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	scenarios, err := h.store.ListDamageScenarios(ctx, db.ListDamageScenariosParams{ItemDefinitionID: itemID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, err
	}
	out := &DamageScenarioListOutput{Body: make([]DamageScenarioBody, 0, len(scenarios))}
	for _, d := range scenarios {
		out.Body = append(out.Body, toDamageScenarioBody(d))
	}
	return out, nil
}

func (h *DamageScenario) Get(ctx context.Context, in *DamageScenarioIDInput) (*DamageScenarioOutput, error) {
	id, itemID, err := parseDamageScenarioIDs(in)
	if err != nil {
		return nil, err
	}
	d, err := h.store.GetDamageScenario(ctx, db.GetDamageScenarioParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, mapDamageScenarioError(err)
	}
	return toDamageScenarioOutput(d), nil
}

func (h *DamageScenario) Replace(ctx context.Context, in *ReplaceDamageScenarioInput) (*DamageScenarioOutput, error) {
	id, itemID, err := parseDamageScenarioIDs(&in.DamageScenarioIDInput)
	if err != nil {
		return nil, err
	}
	d, err := h.store.ReplaceDamageScenario(ctx, db.ReplaceDamageScenarioParams{
		ID:                           id,
		ItemDefinitionID:             itemID,
		Title:                        in.Body.Title,
		FunctionalityAdverseRelation: in.Body.FunctionalityAdverseRelation,
		RoadUserHarmDescription:      in.Body.RoadUserHarmDescription,
	})
	if err != nil {
		return nil, mapDamageScenarioError(err)
	}
	return toDamageScenarioOutput(d), nil
}

func (h *DamageScenario) Update(ctx context.Context, in *UpdateDamageScenarioInput) (*DamageScenarioOutput, error) {
	id, itemID, err := parseDamageScenarioIDs(&in.DamageScenarioIDInput)
	if err != nil {
		return nil, err
	}
	d, err := h.store.UpdateDamageScenario(ctx, db.UpdateDamageScenarioParams{
		ID:                              id,
		ItemDefinitionID:                itemID,
		Title:                           in.Body.Title,
		SetFunctionalityAdverseRelation: in.Body.FunctionalityAdverseRelation.Set,
		FunctionalityAdverseRelation:    in.Body.FunctionalityAdverseRelation.Value,
		SetRoadUserHarmDescription:      in.Body.RoadUserHarmDescription.Set,
		RoadUserHarmDescription:         in.Body.RoadUserHarmDescription.Value,
	})
	if err != nil {
		return nil, mapDamageScenarioError(err)
	}
	return toDamageScenarioOutput(d), nil
}

func (h *DamageScenario) Delete(ctx context.Context, in *DamageScenarioIDInput) (*struct{}, error) {
	id, itemID, err := parseDamageScenarioIDs(in)
	if err != nil {
		return nil, err
	}
	n, err := h.store.DeleteDamageScenario(ctx, db.DeleteDamageScenarioParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, mapDamageScenarioError(err)
	}
	if n == 0 {
		return nil, huma.Error404NotFound("damage scenario not found")
	}
	return nil, nil
}

func parseDamageScenarioIDs(in *DamageScenarioIDInput) (id, itemID pgtype.UUID, err error) {
	if id, err = parseUUID(in.ID); err != nil {
		return
	}
	itemID, err = parseUUID(in.ItemDefinitionID)
	return
}

func mapDamageScenarioError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("damage scenario not found")
	}
	return err
}

func toDamageScenarioBody(d db.DamageScenario) DamageScenarioBody {
	return DamageScenarioBody{
		ID:                           d.ID.String(),
		ItemDefinitionID:             d.ItemDefinitionID.String(),
		Title:                        d.Title,
		FunctionalityAdverseRelation: d.FunctionalityAdverseRelation,
		RoadUserHarmDescription:      d.RoadUserHarmDescription,
	}
}

func toDamageScenarioOutput(d db.DamageScenario) *DamageScenarioOutput {
	return &DamageScenarioOutput{Body: toDamageScenarioBody(d)}
}
