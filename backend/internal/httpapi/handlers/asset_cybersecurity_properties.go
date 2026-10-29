package handlers

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type AssetCybersecurityPropertyStore interface {
	CreateAssetCybersecurityProperty(context.Context, db.CreateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	GetAssetCybersecurityProperty(context.Context, db.GetAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	ListAssetCybersecurityProperties(context.Context, db.ListAssetCybersecurityPropertiesParams) ([]db.AssetCybersecurityProperty, error)
	ReplaceAssetCybersecurityProperty(context.Context, db.ReplaceAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	UpdateAssetCybersecurityProperty(context.Context, db.UpdateAssetCybersecurityPropertyParams) (db.AssetCybersecurityProperty, error)
	DeleteAssetCybersecurityProperty(context.Context, db.DeleteAssetCybersecurityPropertyParams) (pgtype.UUID, error)
}

type AssetCybersecurityProperties struct {
	queries AssetCybersecurityPropertyStore
}

func NewAssetCybersecurityProperties(queries AssetCybersecurityPropertyStore) *AssetCybersecurityProperties {
	return &AssetCybersecurityProperties{queries: queries}
}

func (h *AssetCybersecurityProperties) Register(api huma.API) {
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

type AssetCybersecurityPropertyBody struct {
	PropertyType db.CybersecurityPropertyType `json:"property_type" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY"`
	Description  *string                      `json:"description,omitempty" nullable:"true"`
}

type AssetCybersecurityProperty struct {
	ID           string                       `json:"id" format:"uuid"`
	AssetID      string                       `json:"asset_id" format:"uuid"`
	PropertyType db.CybersecurityPropertyType `json:"property_type" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY"`
	Description  *string                      `json:"description" nullable:"true"`
}

type AssetCybersecurityPropertyParentPath struct {
	AssetParentPath
	AssetID assetUUID `path:"asset_id"`
}

type AssetCybersecurityPropertyIDInput struct {
	AssetCybersecurityPropertyParentPath
	ID assetUUID `path:"id"`
}

type CreateAssetCybersecurityPropertyInput struct {
	AssetCybersecurityPropertyParentPath
	Body AssetCybersecurityPropertyBody
}

type ReplaceAssetCybersecurityPropertyInput struct {
	AssetCybersecurityPropertyIDInput
	Body AssetCybersecurityPropertyBody
}

type UpdateAssetCybersecurityPropertyInput struct {
	AssetCybersecurityPropertyIDInput
	Body struct {
		PropertyType Optional[db.CybersecurityPropertyType] `json:"property_type,omitempty" enum:"CONFIDENTIALITY,INTEGRITY,AVAILABILITY" nullable:"false"`
		Description  Optional[string]                       `json:"description,omitempty"`
	}
}

type ListAssetCybersecurityPropertiesInput struct {
	AssetCybersecurityPropertyParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

type AssetCybersecurityPropertyOutput struct{ Body AssetCybersecurityProperty }
type ListAssetCybersecurityPropertiesOutput struct{ Body []AssetCybersecurityProperty }
type CreateAssetCybersecurityPropertyOutput struct {
	Location string `header:"Location"`
	Body     AssetCybersecurityProperty
}

func assetCybersecurityPropertyBody(p db.AssetCybersecurityProperty) AssetCybersecurityProperty {
	return AssetCybersecurityProperty{ID: p.ID.String(), AssetID: p.AssetID.String(), PropertyType: p.PropertyType, Description: p.Description}
}

func (h *AssetCybersecurityProperties) Create(ctx context.Context, in *CreateAssetCybersecurityPropertyInput) (*CreateAssetCybersecurityPropertyOutput, error) {
	p, err := h.queries.CreateAssetCybersecurityProperty(ctx, db.CreateAssetCybersecurityPropertyParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType, Description: in.Body.Description})
	if err != nil {
		return nil, propertyError(err)
	}
	location := itemCollection(in.ItemDefinitionID, "assets/"+p.AssetID.String()+"/cybersecurity-properties/"+p.ID.String())
	return &CreateAssetCybersecurityPropertyOutput{Location: location, Body: assetCybersecurityPropertyBody(p)}, nil
}

func (h *AssetCybersecurityProperties) Get(ctx context.Context, in *AssetCybersecurityPropertyIDInput) (*AssetCybersecurityPropertyOutput, error) {
	p, err := h.queries.GetAssetCybersecurityProperty(ctx, db.GetAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetCybersecurityPropertyOutput{Body: assetCybersecurityPropertyBody(p)}, nil
}

func (h *AssetCybersecurityProperties) List(ctx context.Context, in *ListAssetCybersecurityPropertiesInput) (*ListAssetCybersecurityPropertiesOutput, error) {
	rows, err := h.queries.ListAssetCybersecurityProperties(ctx, db.ListAssetCybersecurityPropertiesParams{
		ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID), PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, propertyError(err)
	}
	out := &ListAssetCybersecurityPropertiesOutput{Body: make([]AssetCybersecurityProperty, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, assetCybersecurityPropertyBody(row))
	}
	return out, nil
}

func (h *AssetCybersecurityProperties) Replace(ctx context.Context, in *ReplaceAssetCybersecurityPropertyInput) (*AssetCybersecurityPropertyOutput, error) {
	p, err := h.queries.ReplaceAssetCybersecurityProperty(ctx, db.ReplaceAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType, Description: in.Body.Description})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetCybersecurityPropertyOutput{Body: assetCybersecurityPropertyBody(p)}, nil
}

func (h *AssetCybersecurityProperties) Update(ctx context.Context, in *UpdateAssetCybersecurityPropertyInput) (*AssetCybersecurityPropertyOutput, error) {
	if in.Body.PropertyType.Set && in.Body.PropertyType.Value == nil {
		return nil, huma.Error422UnprocessableEntity("property_type cannot be null")
	}
	p, err := h.queries.UpdateAssetCybersecurityProperty(ctx, db.UpdateAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID),
		PropertyType: in.Body.PropertyType.Value, SetDescription: in.Body.Description.Set, Description: in.Body.Description.Value})
	if err != nil {
		return nil, propertyError(err)
	}
	return &AssetCybersecurityPropertyOutput{Body: assetCybersecurityPropertyBody(p)}, nil
}

func (h *AssetCybersecurityProperties) Delete(ctx context.Context, in *AssetCybersecurityPropertyIDInput) (*struct{}, error) {
	_, err := h.queries.DeleteAssetCybersecurityProperty(ctx, db.DeleteAssetCybersecurityPropertyParams{
		ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), AssetID: pgtype.UUID(in.AssetID)})
	if err != nil {
		return nil, propertyError(err)
	}
	return nil, nil
}
