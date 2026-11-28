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

type ThreatScenarioStore interface {
	Auditor
	GetThreatScenarioForUpdate(context.Context, db.GetThreatScenarioForUpdateParams) (db.ThreatScenario, error)
	GetThreatScenarioForDelete(context.Context, db.GetThreatScenarioForDeleteParams) (db.ThreatScenario, error)
	CreateThreatScenario(context.Context, db.CreateThreatScenarioParams) (db.ThreatScenario, error)
	GetThreatScenario(context.Context, db.GetThreatScenarioParams) (db.ThreatScenario, error)
	ListThreatScenarios(context.Context, db.ListThreatScenariosParams) ([]db.ThreatScenario, error)
	ReplaceThreatScenario(context.Context, db.ReplaceThreatScenarioParams) (db.ThreatScenario, error)
	UpdateThreatScenario(context.Context, db.UpdateThreatScenarioParams) (db.ThreatScenario, error)
	DeleteThreatScenario(context.Context, db.DeleteThreatScenarioParams) (int64, error)
}

type ThreatScenario struct {
	store  ThreatScenarioStore
	access ProjectAccessStore
}

func NewThreatScenario(store ThreatScenarioStore, access ProjectAccessStore) *ThreatScenario {
	return &ThreatScenario{store: store, access: access}
}

func (h *ThreatScenario) Register(api huma.API) {
	const collection = "/api/v1/item-definitions/{item_definition_id}/threat-scenarios"
	const member = collection + "/{id}"
	api.OpenAPI().Tags = append(api.OpenAPI().Tags, &huma.Tag{
		Name: "Threat Scenario", Description: "Create, read, replace, update and delete threat scenarios of an item definition.",
	})
	op := func(id, method, path, summary string, status int) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Threat Scenario"}, Security: []map[string][]string{{"bearer": {}}},
			DefaultStatus: status, Errors: []int{http.StatusNotFound, http.StatusConflict, http.StatusUnprocessableEntity}}
	}
	read := InProject(h.access, ScopeItemDefinition, PermRead)
	edit := InProject(h.access, ScopeItemDefinition, PermEdit)
	Register(api, op("list-threat-scenarios", http.MethodGet, collection, "List threat scenarios of an item definition (paginated)", http.StatusOK), read, h.List)
	Register(api, op("create-threat-scenario", http.MethodPost, collection, "Create a threat scenario", http.StatusCreated), edit, h.Create)
	Register(api, op("get-threat-scenario", http.MethodGet, member, "Get a threat scenario", http.StatusOK), read, h.Get)
	Register(api, op("replace-threat-scenario", http.MethodPut, member, "Replace a threat scenario", http.StatusOK), edit, h.Replace)
	Register(api, op("update-threat-scenario", http.MethodPatch, member, "Partially update a threat scenario", http.StatusOK), edit, h.Update)
	Register(api, op("delete-threat-scenario", http.MethodDelete, member, "Delete a threat scenario with its ratings, decisions and links", http.StatusNoContent), edit, h.Delete)
}

type ThreatScenarioBody struct {
	ID                string                `json:"id" format:"uuid"`
	DisplayID         string                `json:"display_id" readOnly:"true" example:"TS-1" doc:"Readable ID, unique within the project and never reused; assigned on creation"`
	ItemDefinitionID  string                `json:"item_definition_id" format:"uuid"`
	Title             string                `json:"title"`
	CauseOfCompromise *string               `json:"cause_of_compromise,omitempty"`
	ElicitationMethod *db.ElicitationMethod `json:"elicitation_method,omitempty" enum:"GROUP_DISCUSSION,MALICIOUS_USE_CASE,EVITA,TVRA,PASTA,STRIDE,OTHER"`
	TechnicalNotes    *string               `json:"technical_notes,omitempty"`
}

type ThreatScenarioOutput struct {
	Body ThreatScenarioBody
}

type CreateThreatScenarioOutput struct {
	Location string `header:"Location"`
	Body     ThreatScenarioBody
}

type ThreatScenarioListOutput struct {
	Body []ThreatScenarioBody
}

type ThreatScenarioParent struct {
	ItemDefinitionID string `path:"item_definition_id" format:"uuid"`
}

type ListThreatScenariosInput struct {
	ThreatScenarioParent
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type ThreatScenarioIDInput struct {
	ThreatScenarioParent
	ID string `path:"id" format:"uuid"`
}

type ThreatScenarioFields struct {
	Title             string                `json:"title" minLength:"1" pattern:"\\S"`
	CauseOfCompromise *string               `json:"cause_of_compromise,omitempty"`
	ElicitationMethod *db.ElicitationMethod `json:"elicitation_method,omitempty" enum:"GROUP_DISCUSSION,MALICIOUS_USE_CASE,EVITA,TVRA,PASTA,STRIDE,OTHER"`
	TechnicalNotes    *string               `json:"technical_notes,omitempty"`
}

type CreateThreatScenarioInput struct {
	ThreatScenarioParent
	Body ThreatScenarioFields
}

type ReplaceThreatScenarioInput struct {
	ThreatScenarioIDInput
	Body ThreatScenarioFields
}

type UpdateThreatScenarioInput struct {
	ThreatScenarioIDInput
	Body struct {
		Title             *string                        `json:"title,omitempty" minLength:"1" pattern:"\\S"`
		CauseOfCompromise Optional[string]               `json:"cause_of_compromise,omitempty"`
		ElicitationMethod Optional[db.ElicitationMethod] `json:"elicitation_method,omitempty" enum:"GROUP_DISCUSSION,MALICIOUS_USE_CASE,EVITA,TVRA,PASTA,STRIDE,OTHER"`
		TechnicalNotes    Optional[string]               `json:"technical_notes,omitempty"`
	}
}

func (h *ThreatScenario) Create(ctx context.Context, in *CreateThreatScenarioInput) (*CreateThreatScenarioOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	var d db.ThreatScenario
	err = audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		var err error
		d, err = h.store.CreateThreatScenario(ctx, db.CreateThreatScenarioParams{
			ItemDefinitionID:  itemID,
			Title:             in.Body.Title,
			CauseOfCompromise: in.Body.CauseOfCompromise,
			ElicitationMethod: in.Body.ElicitationMethod,
			TechnicalNotes:    in.Body.TechnicalNotes,
		})
		if err != nil {
			return db.Change{}, err
		}
		return db.Created(db.TargetThreatScenario, projectIDFromContext(ctx), d.ID, toThreatScenarioBody(d)), nil
	})
	if notFound := itemDeletedOnCreate(err); notFound != nil {
		return nil, notFound
	}
	if err != nil {
		return nil, err
	}
	return &CreateThreatScenarioOutput{
		Location: "/api/v1/item-definitions/" + in.ItemDefinitionID + "/threat-scenarios/" + d.ID.String(),
		Body:     toThreatScenarioBody(d),
	}, nil
}

func (h *ThreatScenario) List(ctx context.Context, in *ListThreatScenariosInput) (*ThreatScenarioListOutput, error) {
	itemID, err := parseUUID(in.ItemDefinitionID)
	if err != nil {
		return nil, err
	}
	scenarios, err := h.store.ListThreatScenarios(ctx, db.ListThreatScenariosParams{ItemDefinitionID: itemID, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, err
	}
	out := &ThreatScenarioListOutput{Body: make([]ThreatScenarioBody, 0, len(scenarios))}
	for _, d := range scenarios {
		out.Body = append(out.Body, toThreatScenarioBody(d))
	}
	return out, nil
}

func (h *ThreatScenario) Get(ctx context.Context, in *ThreatScenarioIDInput) (*ThreatScenarioOutput, error) {
	id, itemID, err := parseThreatScenarioIDs(in)
	if err != nil {
		return nil, err
	}
	d, err := h.store.GetThreatScenario(ctx, db.GetThreatScenarioParams{ID: id, ItemDefinitionID: itemID})
	if err != nil {
		return nil, mapThreatScenarioError(err)
	}
	return toThreatScenarioOutput(d), nil
}

func (h *ThreatScenario) Replace(ctx context.Context, in *ReplaceThreatScenarioInput) (*ThreatScenarioOutput, error) {
	id, itemID, err := parseThreatScenarioIDs(&in.ThreatScenarioIDInput)
	if err != nil {
		return nil, err
	}
	var d db.ThreatScenario
	err = audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetThreatScenarioForUpdate(ctx, db.GetThreatScenarioForUpdateParams{ID: id, ItemDefinitionID: itemID})
		if err != nil {
			return db.Change{}, err
		}
		d, err = h.store.ReplaceThreatScenario(ctx, db.ReplaceThreatScenarioParams{
			ID:                id,
			ItemDefinitionID:  itemID,
			Title:             in.Body.Title,
			CauseOfCompromise: in.Body.CauseOfCompromise,
			ElicitationMethod: in.Body.ElicitationMethod,
			TechnicalNotes:    in.Body.TechnicalNotes,
		})
		if err != nil {
			return db.Change{}, err
		}
		return db.Updated(db.TargetThreatScenario, projectIDFromContext(ctx), d.ID, toThreatScenarioBody(before), toThreatScenarioBody(d)), nil
	})
	if err != nil {
		return nil, mapThreatScenarioError(err)
	}
	return toThreatScenarioOutput(d), nil
}

func (h *ThreatScenario) Update(ctx context.Context, in *UpdateThreatScenarioInput) (*ThreatScenarioOutput, error) {
	id, itemID, err := parseThreatScenarioIDs(&in.ThreatScenarioIDInput)
	if err != nil {
		return nil, err
	}
	var d db.ThreatScenario
	err = audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetThreatScenarioForUpdate(ctx, db.GetThreatScenarioForUpdateParams{ID: id, ItemDefinitionID: itemID})
		if err != nil {
			return db.Change{}, err
		}
		d, err = h.store.UpdateThreatScenario(ctx, db.UpdateThreatScenarioParams{
			ID:                   id,
			ItemDefinitionID:     itemID,
			Title:                in.Body.Title,
			SetCauseOfCompromise: in.Body.CauseOfCompromise.Set,
			CauseOfCompromise:    in.Body.CauseOfCompromise.Value,
			SetElicitationMethod: in.Body.ElicitationMethod.Set,
			ElicitationMethod:    in.Body.ElicitationMethod.Value,
			SetTechnicalNotes:    in.Body.TechnicalNotes.Set,
			TechnicalNotes:       in.Body.TechnicalNotes.Value,
		})
		if err != nil {
			return db.Change{}, err
		}
		return db.Updated(db.TargetThreatScenario, projectIDFromContext(ctx), d.ID, toThreatScenarioBody(before), toThreatScenarioBody(d)), nil
	})
	if err != nil {
		return nil, mapThreatScenarioError(err)
	}
	return toThreatScenarioOutput(d), nil
}

func (h *ThreatScenario) Delete(ctx context.Context, in *ThreatScenarioIDInput) (*struct{}, error) {
	id, itemID, err := parseThreatScenarioIDs(in)
	if err != nil {
		return nil, err
	}
	err = audit(ctx, h.store, func(ctx context.Context) (db.Change, error) {
		before, err := h.store.GetThreatScenarioForDelete(ctx, db.GetThreatScenarioForDeleteParams{ID: id, ItemDefinitionID: itemID})
		if err != nil {
			return db.Change{}, err
		}
		n, err := h.store.DeleteThreatScenario(ctx, db.DeleteThreatScenarioParams{ID: id, ItemDefinitionID: itemID})
		if err != nil {
			return db.Change{}, err
		}
		if n == 0 {
			return db.Change{}, pgx.ErrNoRows
		}
		return db.Deleted(db.TargetThreatScenario, projectIDFromContext(ctx), before.ID, toThreatScenarioBody(before)), nil
	})
	if err != nil {
		return nil, mapThreatScenarioError(err)
	}
	return nil, nil
}

func parseThreatScenarioIDs(in *ThreatScenarioIDInput) (id, itemID pgtype.UUID, err error) {
	if id, err = parseUUID(in.ID); err != nil {
		return
	}
	itemID, err = parseUUID(in.ItemDefinitionID)
	return
}

func mapThreatScenarioError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("threat scenario not found")
	}
	return err
}

func toThreatScenarioBody(d db.ThreatScenario) ThreatScenarioBody {
	return ThreatScenarioBody{
		ID:                d.ID.String(),
		DisplayID:         displayID(displayPrefixThreatScenario, d.DisplayNumber),
		ItemDefinitionID:  d.ItemDefinitionID.String(),
		Title:             d.Title,
		CauseOfCompromise: d.CauseOfCompromise,
		ElicitationMethod: d.ElicitationMethod,
		TechnicalNotes:    d.TechnicalNotes,
	}
}

func toThreatScenarioOutput(d db.ThreatScenario) *ThreatScenarioOutput {
	return &ThreatScenarioOutput{Body: toThreatScenarioBody(d)}
}
