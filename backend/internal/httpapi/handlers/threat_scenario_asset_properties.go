package handlers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type ThreatPropertyLinkStore interface {
	CreateThreatScenarioAssetProperty(context.Context, db.CreateThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error)
	GetThreatScenarioAssetProperty(context.Context, db.GetThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error)
	ListThreatScenarioAssetProperties(context.Context, db.ListThreatScenarioAssetPropertiesParams) ([]db.ThreatScenarioAssetProperty, error)
	ReplaceThreatScenarioAssetProperty(context.Context, db.ReplaceThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error)
	UpdateThreatScenarioAssetProperty(context.Context, db.UpdateThreatScenarioAssetPropertyParams) (db.ThreatScenarioAssetProperty, error)
	DeleteThreatScenarioAssetProperty(context.Context, db.DeleteThreatScenarioAssetPropertyParams) (pgtype.UUID, error)
}

type ThreatScenarioAssetProperties struct{ queries ThreatPropertyLinkStore }

func NewThreatScenarioAssetProperties(queries ThreatPropertyLinkStore) *ThreatScenarioAssetProperties {
	return &ThreatScenarioAssetProperties{queries: queries}
}

func (h *ThreatScenarioAssetProperties) Register(api huma.API) {
	const collection = itemDefinitionPath + "/threat-scenario-asset-properties"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return propertyOperation(id, method, path, "Threat scenario asset properties", summary)
	}
	huma.Register(api, op("list-threat-scenario-asset-properties", http.MethodGet, collection, "List threat scenario asset property links"), h.List)
	huma.Register(api, op("get-threat-scenario-asset-property", http.MethodGet, member, "Get a threat scenario asset property link"), h.Get)
	huma.Register(api, op("create-threat-scenario-asset-property", http.MethodPost, collection, "Create a threat scenario asset property link"), h.Create)
	huma.Register(api, op("replace-threat-scenario-asset-property", http.MethodPut, member, "Replace a threat scenario asset property link"), h.Replace)
	huma.Register(api, op("update-threat-scenario-asset-property", http.MethodPatch, member, "Partially update a threat scenario asset property link"), h.Update)
	huma.Register(api, op("delete-threat-scenario-asset-property", http.MethodDelete, member, "Delete a threat scenario asset property link"), h.Delete)
}

type ThreatPropertyLinkBody struct {
	ThreatScenarioID             assetUUID `json:"threat_scenario_id"`
	AssetCybersecurityPropertyID assetUUID `json:"asset_cybersecurity_property_id"`
}

type ThreatPropertyLink struct {
	ID                           string `json:"id" format:"uuid"`
	ThreatScenarioID             string `json:"threat_scenario_id" format:"uuid"`
	AssetCybersecurityPropertyID string `json:"asset_cybersecurity_property_id" format:"uuid"`
}

type CreateThreatPropertyLinkInput struct {
	AssetParentPath
	Body ThreatPropertyLinkBody
}
type ReplaceThreatPropertyLinkInput struct {
	PropertyLinkIDInput
	Body ThreatPropertyLinkBody
}
type UpdateThreatPropertyLinkInput struct {
	PropertyLinkIDInput
	Body struct {
		ThreatScenarioID             Optional[assetUUID] `json:"threat_scenario_id,omitempty" nullable:"false"`
		AssetCybersecurityPropertyID Optional[assetUUID] `json:"asset_cybersecurity_property_id,omitempty" nullable:"false"`
	}
}

type ThreatPropertyLinkOutput struct{ Body ThreatPropertyLink }
type ListThreatPropertyLinksOutput struct{ Body []ThreatPropertyLink }
type CreateThreatPropertyLinkOutput struct {
	Location string `header:"Location"`
	Body     ThreatPropertyLink
}

func threatPropertyLinkBody(row db.ThreatScenarioAssetProperty) ThreatPropertyLink {
	return ThreatPropertyLink{ID: row.ID.String(), ThreatScenarioID: row.ThreatScenarioID.String(),
		AssetCybersecurityPropertyID: row.AssetCybersecurityPropertyID.String()}
}

func (h *ThreatScenarioAssetProperties) Create(ctx context.Context, in *CreateThreatPropertyLinkInput) (*CreateThreatPropertyLinkOutput, error) {
	row, err := h.queries.CreateThreatScenarioAssetProperty(ctx, db.CreateThreatScenarioAssetPropertyParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), ThreatScenarioID: pgtype.UUID(in.Body.ThreatScenarioID),
		AssetCybersecurityPropertyID: pgtype.UUID(in.Body.AssetCybersecurityPropertyID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &CreateThreatPropertyLinkOutput{
		Location: itemCollection(in.ItemDefinitionID, "threat-scenario-asset-properties/"+row.ID.String()),
		Body:     threatPropertyLinkBody(row)}, nil
}

func (h *ThreatScenarioAssetProperties) Get(ctx context.Context, in *PropertyLinkIDInput) (*ThreatPropertyLinkOutput, error) {
	row, err := h.queries.GetThreatScenarioAssetProperty(ctx, db.GetThreatScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &ThreatPropertyLinkOutput{Body: threatPropertyLinkBody(row)}, nil
}

func (h *ThreatScenarioAssetProperties) List(ctx context.Context, in *ListPropertyLinksInput) (*ListThreatPropertyLinksOutput, error) {
	rows, err := h.queries.ListThreatScenarioAssetProperties(ctx, db.ListThreatScenarioAssetPropertiesParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, propertyError(err)
	}
	out := &ListThreatPropertyLinksOutput{Body: make([]ThreatPropertyLink, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, threatPropertyLinkBody(row))
	}
	return out, nil
}

func (h *ThreatScenarioAssetProperties) Replace(ctx context.Context, in *ReplaceThreatPropertyLinkInput) (*ThreatPropertyLinkOutput, error) {
	row, err := h.queries.ReplaceThreatScenarioAssetProperty(ctx, db.ReplaceThreatScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		ThreatScenarioID:             pgtype.UUID(in.Body.ThreatScenarioID),
		AssetCybersecurityPropertyID: pgtype.UUID(in.Body.AssetCybersecurityPropertyID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &ThreatPropertyLinkOutput{Body: threatPropertyLinkBody(row)}, nil
}

func (h *ThreatScenarioAssetProperties) Update(ctx context.Context, in *UpdateThreatPropertyLinkInput) (*ThreatPropertyLinkOutput, error) {
	b := in.Body
	if (b.ThreatScenarioID.Set && b.ThreatScenarioID.Value == nil) ||
		(b.AssetCybersecurityPropertyID.Set && b.AssetCybersecurityPropertyID.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("scenario and property IDs cannot be null")
	}
	row, err := h.queries.UpdateThreatScenarioAssetProperty(ctx, db.UpdateThreatScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		ThreatScenarioID: optionalUUID(b.ThreatScenarioID), AssetCybersecurityPropertyID: optionalUUID(b.AssetCybersecurityPropertyID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &ThreatPropertyLinkOutput{Body: threatPropertyLinkBody(row)}, nil
}

func (h *ThreatScenarioAssetProperties) Delete(ctx context.Context, in *PropertyLinkIDInput) (*struct{}, error) {
	_, err := h.queries.DeleteThreatScenarioAssetProperty(ctx, db.DeleteThreatScenarioAssetPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return nil, nil
}
