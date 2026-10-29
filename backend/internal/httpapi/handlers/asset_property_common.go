package handlers

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

const itemDefinitionPath = "/api/v1/item-definitions/{item_definition_id}"

// PropertyLinkIDInput reads the item definition and link IDs from an individual-link URL.
type PropertyLinkIDInput struct {
	AssetParentPath
	ID assetUUID `path:"id"`
}

// ListPropertyLinksInput reads the item definition URL ID and the limit/offset query parameters.
type ListPropertyLinksInput struct {
	AssetParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

// propertyOperation builds shared Huma metadata for property and scenario-link routes.
// It declares session security and errors, sets POST to 201, and describes PATCH semantics.
// The router middleware performs the actual session check.
func propertyOperation(id, method, path, tag, summary string) huma.Operation {
	op := huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary,
		Tags: []string{tag}, Security: []map[string][]string{{"session": {}}},
		Errors: []int{401, 404, 409, 422, 503}}
	switch method {
	case http.MethodPost:
		op.DefaultStatus = http.StatusCreated
	case http.MethodPatch:
		op.Description = "Omitted fields remain unchanged. Required fields cannot be null; optional text fields can be cleared with null."
	}
	return op
}

// propertyError converts database failures into public HTTP errors.
// Missing rows become 404, uniqueness violations become 409, and deleted references become 422.
// Unexpected failures are logged, while clients receive 503 without internal database details.
func propertyError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("record or referenced parent not found in this item definition")
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "23505":
			return huma.Error409Conflict("this property or scenario link already exists")
		case "23503":
			return huma.Error422UnprocessableEntity("referenced record no longer exists")
		}
	}
	slog.Warn("asset property database operation failed", "error", err)
	return huma.Error503ServiceUnavailable("database unavailable")
}

// optionalUUID converts a PATCH reference into a database UUID parameter.
// An omitted value becomes SQL NULL so the query can preserve the existing reference with COALESCE.
// Handlers must reject explicit null references before calling this helper.
func optionalUUID(value Optional[assetUUID]) pgtype.UUID {
	if value.Value == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID(*value.Value)
}

// itemCollection builds an item-scoped resource URL, used for the Location header after creation.
func itemCollection(item assetUUID, resource string) string {
	return "/api/v1/item-definitions/" + pgtype.UUID(item).String() + "/" + resource
}
