package handlers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type AssetPropertyStore interface {
	CreateAssetCybersecurityProperty(context.Context, db.CreateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	GetAssetCybersecurityProperty(context.Context, db.GetAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	ListAssetCybersecurityProperties(context.Context, db.ListAssetCybersecurityPropertiesParams) ([]db.AssetCybersecurityProperty, error)
	ReplaceAssetCybersecurityProperty(context.Context, db.ReplaceAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	UpdateAssetCybersecurityProperty(context.Context, db.UpdateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	DeleteAssetCybersecurityProperty(context.Context, db.DeleteAssetCybersecurityPropertyParams) (pgtype.UUID, error)
}

type AssetProperties struct{ queries AssetPropertyStore }

func NewAssetProperties(queries AssetPropertyStore) *AssetProperties {
	return &AssetProperties{queries: queries}
}

func (h *AssetProperties) Register(api huma.API) {
	const collection = itemDefinitionPath + "/assets/{asset_id}/cybersecurity-properties"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return propertyOperation(id, method, path, "Asset cybersecurity properties", summary)
	}
	huma.Register(api, op("list-asset-cybersecurity-properties", http.MethodGet, collection, "List an asset's cybersecurity properties"), h.List)
	huma.Register(api, op("get-asset-cybersecurity-property", http.MethodGet, member, "Get an asset cybersecurity property"), h.Get)
	huma.Register(api, op("create-asset-cybersecurity-property", http.MethodPost, collection, "Create an asset cybersecurity property"), h.Create)
	huma.Register(api, op("replace-asset-cybersecurity-property", http.MethodPut, member, "Replace an asset cybersecurity property"), h.Replace)
	huma.Register(api, op("update-asset-cybersecurity-property", http.MethodPatch, member, "Partially update an asset cybersecurity property"), h.Update)
	del := op("delete-asset-cybersecurity-property", http.MethodDelete, member, "Delete an asset cybersecurity property")
	del.Description = "Also deletes damage and threat scenario links for this property."
	huma.Register(api, del, h.Delete)
}

type AssetPropertyBody struct {
	PropertyType db.CybersecurityPropertyType `json:"property_type" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY"`
	Description  *string                      `json:"description,omitempty" nullable:"true"`
}

type AssetProperty struct {
	ID           string                       `json:"id" format:"uuid"`
	AssetID      string                       `json:"asset_id" format:"uuid"`
	PropertyType db.CybersecurityPropertyType `json:"property_type" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY"`
	Description  *string                      `json:"description" nullable:"true"`
}

type AssetPropertyParentPath struct {
	AssetParentPath
	AssetID assetUUID `path:"asset_id"`
}

type AssetPropertyIDInput struct {
	AssetPropertyParentPath
	ID assetUUID `path:"id"`
}

type CreateAssetPropertyInput struct {
	AssetPropertyParentPath
	Body AssetPropertyBody
}

type ReplaceAssetPropertyInput struct {
	AssetPropertyIDInput
	Body AssetPropertyBody
}

type UpdateAssetPropertyInput struct {
	AssetPropertyIDInput
	Body struct {
		PropertyType Optional[db.CybersecurityPropertyType] `json:"property_type,omitempty" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY" nullable:"false"`
		Description  Optional[string]                       `json:"description,omitempty"`
	}
}

type ListAssetPropertiesInput struct {
	AssetPropertyParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type AssetPropertyOutput struct{ Body AssetProperty }
type ListAssetPropertiesOutput struct{ Body []AssetProperty }
type CreateAssetPropertyOutput struct {
	Location string `header:"Location"`
	Body     AssetProperty
}

func assetPropertyBody(p db.AssetCybersecurityProperty) AssetProperty {
	return AssetProperty{ID: p.ID.String(), AssetID: p.AssetID.String(), PropertyType: p.PropertyType, Description: p.Description}
}

func (h *AssetProperties) Create(ctx context.Context, in *CreateAssetPropertyInput) (*CreateAssetPropertyOutput, error) {
	p, err := h.queries.CreateAssetCybersecurityProperty(ctx, db.CreateAssetCybersecurityPropertyParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType, Description: in.Body.Description})
	if err != nil {
		return nil, propertyError(err)
	}
	location := itemCollection(in.ItemDefinitionID, "assets/"+p.AssetID.String()+"/cybersecurity-properties/"+p.ID.String())
	return &CreateAssetPropertyOutput{Location: location, Body: assetPropertyBody(p)}, nil
}

func (h *AssetProperties) Get(ctx context.Context, in *AssetPropertyIDInput) (*AssetPropertyOutput, error) {
	p, err := h.queries.GetAssetCybersecurityProperty(ctx, db.GetAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetPropertyOutput{Body: assetPropertyBody(p)}, nil
}

func (h *AssetProperties) List(ctx context.Context, in *ListAssetPropertiesInput) (*ListAssetPropertiesOutput, error) {
	rows, err := h.queries.ListAssetCybersecurityProperties(ctx, db.ListAssetCybersecurityPropertiesParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID), PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, propertyError(err)
	}
	out := &ListAssetPropertiesOutput{Body: make([]AssetProperty, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, assetPropertyBody(row))
	}
	return out, nil
}

func (h *AssetProperties) Replace(ctx context.Context, in *ReplaceAssetPropertyInput) (*AssetPropertyOutput, error) {
	p, err := h.queries.ReplaceAssetCybersecurityProperty(ctx, db.ReplaceAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType, Description: in.Body.Description})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetPropertyOutput{Body: assetPropertyBody(p)}, nil
}

func (h *AssetProperties) Update(ctx context.Context, in *UpdateAssetPropertyInput) (*AssetPropertyOutput, error) {
	if in.Body.PropertyType.Set && in.Body.PropertyType.Value == nil {
		return nil, huma.Error422UnprocessableEntity("property_type cannot be null")
	}
	p, err := h.queries.UpdateAssetCybersecurityProperty(ctx, db.UpdateAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType.Value, SetDescription: in.Body.Description.Set, Description: in.Body.Description.Value})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetPropertyOutput{Body: assetPropertyBody(p)}, nil
}

func (h *AssetProperties) Delete(ctx context.Context, in *AssetPropertyIDInput) (*struct{}, error) {
	_, err := h.queries.DeleteAssetCybersecurityProperty(ctx, db.DeleteAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return nil, nil
}
