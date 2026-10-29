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

type PropertyLinkIDInput struct {
	AssetParentPath
	ID assetUUID `path:"id"`
}

type ListPropertyLinksInput struct {
	AssetParentPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0" maximum:"2147483647"`
}

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

func optionalUUID(value Optional[assetUUID]) pgtype.UUID {
	if value.Value == nil {
		return pgtype.UUID{}
	}
	return pgtype.UUID(*value.Value)
}

func itemCollection(item assetUUID, resource string) string {
	return "/api/v1/item-definitions/" + pgtype.UUID(item).String() + "/" + resource
}
