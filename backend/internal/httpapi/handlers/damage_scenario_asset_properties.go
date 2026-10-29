package handlers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type DamagePropertyLinkStore interface {
	CreateDamageScenarioAssetProperty(context.Context, db.CreateDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error)
	GetDamageScenarioAssetProperty(context.Context, db.GetDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error)
	ListDamageScenarioAssetProperties(context.Context, db.ListDamageScenarioAssetPropertiesParams) ([]db.DamageScenarioAssetProperty, error)
	ReplaceDamageScenarioAssetProperty(context.Context, db.ReplaceDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error)
	UpdateDamageScenarioAssetProperty(context.Context, db.UpdateDamageScenarioAssetPropertyParams) (db.DamageScenarioAssetProperty, error)
	DeleteDamageScenarioAssetProperty(context.Context, db.DeleteDamageScenarioAssetPropertyParams) (pgtype.UUID, error)
}

type DamageScenarioAssetProperties struct{ queries DamagePropertyLinkStore }

func NewDamageScenarioAssetProperties(queries DamagePropertyLinkStore) *DamageScenarioAssetProperties {
	return &DamageScenarioAssetProperties{queries: queries}
}

func (h *DamageScenarioAssetProperties) Register(api huma.API) {
	const collection = itemDefinitionPath + "/damage-scenario-asset-properties"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return propertyOperation(id, method, path, "Damage scenario asset properties", summary)
	}
	huma.Register(api, op("list-damage-scenario-asset-properties", http.MethodGet, collection, "List damage scenario asset property links"), h.List)
	huma.Register(api, op("get-damage-scenario-asset-property", http.MethodGet, member, "Get a damage scenario asset property link"), h.Get)
	huma.Register(api, op("create-damage-scenario-asset-property", http.MethodPost, collection, "Create a damage scenario asset property link"), h.Create)
	huma.Register(api, op("replace-damage-scenario-asset-property", http.MethodPut, member, "Replace a damage scenario asset property link"), h.Replace)
	huma.Register(api, op("update-damage-scenario-asset-property", http.MethodPatch, member, "Partially update a damage scenario asset property link"), h.Update)
	huma.Register(api, op("delete-damage-scenario-asset-property", http.MethodDelete, member, "Delete a damage scenario asset property link"), h.Delete)
}

type DamagePropertyLinkBody struct {
	DamageScenarioID             assetUUID `json:"damage_scenario_id"`
	AssetCybersecurityPropertyID assetUUID `json:"asset_cybersecurity_property_id"`
	CompromiseMechanismNote      *string   `json:"compromise_mechanism_note,omitempty" nullable:"true"`
}

type DamagePropertyLink struct {
	ID                           string  `json:"id" format:"uuid"`
	DamageScenarioID             string  `json:"damage_scenario_id" format:"uuid"`
	AssetCybersecurityPropertyID string  `json:"asset_cybersecurity_property_id" format:"uuid"`
	CompromiseMechanismNote      *string `json:"compromise_mechanism_note" nullable:"true"`
}

type CreateDamagePropertyLinkInput struct {
	AssetParentPath
	Body DamagePropertyLinkBody
}
type ReplaceDamagePropertyLinkInput struct {
	PropertyLinkIDInput
	Body DamagePropertyLinkBody
}
type UpdateDamagePropertyLinkInput struct {
	PropertyLinkIDInput
	Body struct {
		DamageScenarioID             Optional[assetUUID] `json:"damage_scenario_id,omitempty" nullable:"false"`
		AssetCybersecurityPropertyID Optional[assetUUID] `json:"asset_cybersecurity_property_id,omitempty" nullable:"false"`
		CompromiseMechanismNote      Optional[string]    `json:"compromise_mechanism_note,omitempty"`
	}
}

type DamagePropertyLinkOutput struct{ Body DamagePropertyLink }
type ListDamagePropertyLinksOutput struct{ Body []DamagePropertyLink }
type CreateDamagePropertyLinkOutput struct {
	Location string `header:"Location"`
	Body     DamagePropertyLink
}

func damagePropertyLinkBody(row db.DamageScenarioAssetProperty) DamagePropertyLink {
	return DamagePropertyLink{ID: row.ID.String(), DamageScenarioID: row.DamageScenarioID.String(),
		AssetCybersecurityPropertyID: row.AssetCybersecurityPropertyID.String(), CompromiseMechanismNote: row.CompromiseMechanismNote}
}

func (h *DamageScenarioAssetProperties) Create(ctx context.Context, in *CreateDamagePropertyLinkInput) (*CreateDamagePropertyLinkOutput, error) {
	row, err := h.queries.CreateDamageScenarioAssetProperty(ctx, db.CreateDamageScenarioAssetPropertyParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), DamageScenarioID: pgtype.UUID(in.Body.DamageScenarioID),
		AssetCybersecurityPropertyID: pgtype.UUID(in.Body.AssetCybersecurityPropertyID), CompromiseMechanismNote: in.Body.CompromiseMechanismNote})
	if err != nil {
		return nil, propertyError(err)
	}
	return &CreateDamagePropertyLinkOutput{
		Location: itemCollection(in.ItemDefinitionID, "damage-scenario-asset-properties/"+row.ID.String()),
		Body:     damagePropertyLinkBody(row)}, nil
}

func (h *DamageScenarioAssetProperties) Get(ctx context.Context, in *PropertyLinkIDInput) (*DamagePropertyLinkOutput, error) {
	row, err := h.queries.GetDamageScenarioAssetProperty(ctx, db.GetDamageScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &DamagePropertyLinkOutput{Body: damagePropertyLinkBody(row)}, nil
}

func (h *DamageScenarioAssetProperties) List(ctx context.Context, in *ListPropertyLinksInput) (*ListDamagePropertyLinksOutput, error) {
	rows, err := h.queries.ListDamageScenarioAssetProperties(ctx, db.ListDamageScenarioAssetPropertiesParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, propertyError(err)
	}
	out := &ListDamagePropertyLinksOutput{Body: make([]DamagePropertyLink, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, damagePropertyLinkBody(row))
	}
	return out, nil
}

func (h *DamageScenarioAssetProperties) Replace(ctx context.Context, in *ReplaceDamagePropertyLinkInput) (*DamagePropertyLinkOutput, error) {
	row, err := h.queries.ReplaceDamageScenarioAssetProperty(ctx, db.ReplaceDamageScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		DamageScenarioID:             pgtype.UUID(in.Body.DamageScenarioID),
		AssetCybersecurityPropertyID: pgtype.UUID(in.Body.AssetCybersecurityPropertyID), CompromiseMechanismNote: in.Body.CompromiseMechanismNote})
	if err != nil {
		return nil, propertyError(err)
	}
	return &DamagePropertyLinkOutput{Body: damagePropertyLinkBody(row)}, nil
}

func (h *DamageScenarioAssetProperties) Update(ctx context.Context, in *UpdateDamagePropertyLinkInput) (*DamagePropertyLinkOutput, error) {
	b := in.Body
	if (b.DamageScenarioID.Set && b.DamageScenarioID.Value == nil) ||
		(b.AssetCybersecurityPropertyID.Set && b.AssetCybersecurityPropertyID.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("scenario and property IDs cannot be null")
	}
	row, err := h.queries.UpdateDamageScenarioAssetProperty(ctx, db.UpdateDamageScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		DamageScenarioID: optionalUUID(b.DamageScenarioID), AssetCybersecurityPropertyID: optionalUUID(b.AssetCybersecurityPropertyID),
		SetCompromiseMechanismNote: b.CompromiseMechanismNote.Set, CompromiseMechanismNote: b.CompromiseMechanismNote.Value})
	if err != nil {
		return nil, propertyError(err)
	}
	return &DamagePropertyLinkOutput{Body: damagePropertyLinkBody(row)}, nil
}

func (h *DamageScenarioAssetProperties) Delete(ctx context.Context, in *PropertyLinkIDInput) (*struct{}, error) {
	_, err := h.queries.DeleteDamageScenarioAssetProperty(ctx, db.DeleteDamageScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return nil, nil
}
