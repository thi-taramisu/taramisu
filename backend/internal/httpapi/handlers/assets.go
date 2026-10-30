package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"reflect"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type AssetStore interface {
	CreateAsset(context.Context, db.CreateAssetParams) (db.Asset, error)
	GetAsset(context.Context, db.GetAssetParams) (db.Asset, error)
	ListAssets(context.Context, db.ListAssetsParams) ([]db.Asset, error)
	ReplaceAsset(context.Context, db.ReplaceAssetParams) (db.Asset, error)
	UpdateAsset(context.Context, db.UpdateAssetParams) (db.Asset, error)
	DeleteAsset(context.Context, db.DeleteAssetParams) (pgtype.UUID, error)
}

type Assets struct{ queries AssetStore }

func NewAssets(queries AssetStore) *Assets { return &Assets{queries: queries} }

func (h *Assets) Register(api huma.API) {
	const collection = "/api/v1/item-definitions/{item_definition_id}/assets"
	const member = collection + "/{id}"
	op := func(id, method, path, summary string) huma.Operation {
		return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
			Tags: []string{"Assets"}, Security: []map[string][]string{{"session": {}}},
			Errors: []int{401, 404, 422, 503}}
	}
	huma.Register(api, op("list-assets", http.MethodGet, collection, "List assets"), h.List)
	huma.Register(api, op("get-asset", http.MethodGet, member, "Get an asset"), h.Get)
	create := op("create-asset", http.MethodPost, collection, "Create an asset")
	create.DefaultStatus = http.StatusCreated
	huma.Register(api, create, h.Create)
	huma.Register(api, op("replace-asset", http.MethodPut, member, "Replace an asset"), h.Replace)
	patch := op("update-asset", http.MethodPatch, member, "Partially update an asset")
	patch.Description = "Omitted fields remain unchanged. Set description or identification_source to null to clear them."
	huma.Register(api, patch, h.Update)
	del := op("delete-asset", http.MethodDelete, member, "Delete an asset")
	del.Description = "Also deletes the asset's cybersecurity properties and their scenario links."
	huma.Register(api, del, h.Delete)
}

type AssetBody struct {
	Name                 string                   `json:"name" minLength:"1" pattern:"\\S"`
	Description          *string                  `json:"description,omitempty" nullable:"true"`
	IdentificationSource *db.IdentificationSource `json:"identification_source,omitempty" nullable:"true" enum:"ITEM_DEF,IMPACT_RATING,THREAT_DERIVED,CATALOGUE"`
}

type Asset struct {
	ID                   string                   `json:"id" format:"uuid"`
	ItemDefinitionID     string                   `json:"item_definition_id" format:"uuid"`
	Name                 string                   `json:"name"`
	Description          *string                  `json:"description" nullable:"true"`
	IdentificationSource *db.IdentificationSource `json:"identification_source" nullable:"true" enum:"ITEM_DEF,IMPACT_RATING,THREAT_DERIVED,CATALOGUE"`
}

type AssetOutput struct{ Body Asset }
type CreateAssetOutput struct {
	Location string `header:"Location"`
	Body     Asset
}
type AssetParentPath struct {
	ItemDefinitionID assetUUID `path:"item_definition_id"`
}

type AssetIDInput struct {
	AssetParentPath
	ID assetUUID `path:"id"`
}
type CreateAssetInput struct {
	AssetParentPath
	Body AssetBody
}
type ReplaceAssetInput struct {
	AssetIDInput
	Body AssetBody
}

// Optional distinguishes an omitted PATCH field from an explicit JSON null.
type Optional[T any] struct {
	Set   bool
	Value *T
}

func (o *Optional[T]) UnmarshalJSON(data []byte) error {
	o.Set = true
	return json.Unmarshal(data, &o.Value)
}
func (o Optional[T]) Schema(r huma.Registry) *huma.Schema {
	s := *r.Schema(reflect.TypeFor[T](), true, "")
	s.Nullable = true
	return &s
}

type UpdateAssetInput struct {
	AssetIDInput
	Body UpdateAssetInputBody
}
type UpdateAssetInputBody struct {
	Name                 Optional[string]                  `json:"name,omitempty" minLength:"1" pattern:"\\S" nullable:"false"`
	Description          Optional[string]                  `json:"description,omitempty"`
	IdentificationSource Optional[db.IdentificationSource] `json:"identification_source,omitempty" enum:"ITEM_DEF,IMPACT_RATING,THREAT_DERIVED,CATALOGUE"`
}

// OpenAPI 3.1 requires null in both the type union and the enum.
func nullableIdentificationSourceSchema(s *huma.Schema) *huma.Schema {
	source := s.Properties["identification_source"]
	source.Enum = append(source.Enum, nil)
	source.PrecomputeMessages()
	return s
}
func (AssetBody) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullableIdentificationSourceSchema(s)
}
func (Asset) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullableIdentificationSourceSchema(s)
}
func (UpdateAssetInputBody) TransformSchema(_ huma.Registry, s *huma.Schema) *huma.Schema {
	return nullableIdentificationSourceSchema(s)
}

type ListAssetsInput struct {
	AssetParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}
type ListAssetsOutput struct{ Body []Asset }

// assetUUID parses path parameters before the handler can access the database.
type assetUUID pgtype.UUID

func (id *assetUUID) UnmarshalText(text []byte) error {
	return (*pgtype.UUID)(id).Scan(string(text))
}
func (assetUUID) Schema(huma.Registry) *huma.Schema {
	return &huma.Schema{Type: "string", Format: "uuid",
		Pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"}
}
func assetBody(a db.Asset) Asset {
	return Asset{ID: a.ID.String(), ItemDefinitionID: a.ItemDefinitionID.String(), Name: a.Name,
		Description: a.Description, IdentificationSource: a.IdentificationSource}
}
func assetError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("asset not found")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23503" {
		return huma.Error422UnprocessableEntity("item_definition_id does not reference an existing item definition")
	}
	slog.Warn("asset database operation failed", "error", err)
	return huma.Error503ServiceUnavailable("database unavailable")
}
func (h *Assets) Create(ctx context.Context, in *CreateAssetInput) (*CreateAssetOutput, error) {
	a, err := h.queries.CreateAsset(ctx, db.CreateAssetParams{ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		Name: in.Body.Name, Description: in.Body.Description, IdentificationSource: in.Body.IdentificationSource})
	if err != nil {
		return nil, assetError(err)
	}
	return &CreateAssetOutput{Location: "/api/v1/item-definitions/" + a.ItemDefinitionID.String() + "/assets/" + a.ID.String(), Body: assetBody(a)}, nil
}
func (h *Assets) Get(ctx context.Context, in *AssetIDInput) (*AssetOutput, error) {
	a, err := h.queries.GetAsset(ctx, db.GetAssetParams{ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, assetError(err)
	}
	return &AssetOutput{Body: assetBody(a)}, nil
}
func (h *Assets) List(ctx context.Context, in *ListAssetsInput) (*ListAssetsOutput, error) {
	assets, err := h.queries.ListAssets(ctx, db.ListAssetsParams{ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID), PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, assetError(err)
	}
	out := &ListAssetsOutput{Body: make([]Asset, 0, len(assets))}
	for _, a := range assets {
		out.Body = append(out.Body, assetBody(a))
	}
	return out, nil
}
func (h *Assets) Replace(ctx context.Context, in *ReplaceAssetInput) (*AssetOutput, error) {
	a, err := h.queries.ReplaceAsset(ctx, db.ReplaceAssetParams{ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		Name: in.Body.Name, Description: in.Body.Description, IdentificationSource: in.Body.IdentificationSource})
	if err != nil {
		return nil, assetError(err)
	}
	return &AssetOutput{Body: assetBody(a)}, nil
}
func (h *Assets) Update(ctx context.Context, in *UpdateAssetInput) (*AssetOutput, error) {
	b := in.Body
	if b.Name.Set && b.Name.Value == nil {
		return nil, huma.Error422UnprocessableEntity("name cannot be null")
	}
	p := db.UpdateAssetParams{ID: pgtype.UUID(in.ID), Name: b.Name.Value, ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID),
		SetDescription: b.Description.Set, Description: b.Description.Value,
		SetIdentificationSource: b.IdentificationSource.Set, IdentificationSource: b.IdentificationSource.Value}
	a, err := h.queries.UpdateAsset(ctx, p)
	if err != nil {
		return nil, assetError(err)
	}
	return &AssetOutput{Body: assetBody(a)}, nil
}
func (h *Assets) Delete(ctx context.Context, in *AssetIDInput) (*struct{}, error) {
	_, err := h.queries.DeleteAsset(ctx, db.DeleteAssetParams{ID: pgtype.UUID(in.ID), ItemDefinitionID: pgtype.UUID(in.ItemDefinitionID)})
	if err != nil {
		return nil, assetError(err)
	}
	return nil, nil
}
