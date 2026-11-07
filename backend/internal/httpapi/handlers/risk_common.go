package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/auth"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

const riskScenarioPath = "/api/v1/threat-scenarios/{threat_scenario_id}"

type RiskAccessStore interface {
	CanAccessRiskScenario(context.Context, db.CanAccessRiskScenarioParams) (bool, error)
}

type RiskScenarioPath struct {
	ThreatScenarioID string `path:"threat_scenario_id" format:"uuid"`
}
type RiskResourcePath struct {
	RiskScenarioPath
	ID string `path:"id" format:"uuid"`
}
type RiskListInput struct {
	RiskScenarioPath
	Limit  int32 `query:"limit" default:"50" minimum:"1" maximum:"100"`
	Offset int32 `query:"offset" default:"0" minimum:"0"`
}

// riskField distinguishes omitted PATCH fields from explicit JSON null.
type riskField[T any] struct {
	Sent  bool
	Value *T
}

func (f *riskField[T]) UnmarshalJSON(data []byte) error {
	f.Sent = true
	return json.Unmarshal(data, &f.Value)
}
func (riskField[T]) Schema(huma.Registry) *huma.Schema {
	typ := "string"
	switch any(new(T)).(type) {
	case *int32:
		typ = "integer"
	case *bool:
		typ = "boolean"
	}
	return &huma.Schema{Type: typ, Nullable: false}
}

// nullableRiskField permits explicit null for nullable database columns.
type nullableRiskField[T any] struct{ riskField[T] }

func (nullableRiskField[T]) Schema(r huma.Registry) *huma.Schema {
	schema := (riskField[T]{}).Schema(r)
	schema.Nullable = true
	return schema
}

func riskUUID(value string) pgtype.UUID {
	var id pgtype.UUID
	// Huma validates UUID input before dispatch; authenticated user IDs are internal UUIDs.
	_ = id.Scan(value)
	return id
}
func optionalRiskUUID(value *string) pgtype.UUID {
	if value == nil {
		return pgtype.UUID{}
	}
	return riskUUID(*value)
}
func riskUUIDString(id pgtype.UUID) *string {
	if !id.Valid {
		return nil
	}
	value := id.String()
	return &value
}
func authorizeRisk(ctx context.Context, store RiskAccessStore, scenario string, readOnly bool) (pgtype.UUID, error) {
	id := riskUUID(scenario)
	user := riskUUID(auth.UserFromContext(ctx).ID)
	if !user.Valid {
		return id, huma.Error401Unauthorized("authentication required")
	}
	allowed, err := store.CanAccessRiskScenario(ctx, db.CanAccessRiskScenarioParams{ThreatScenarioID: id, UserID: user, ReadOnly: readOnly})
	if err != nil {
		return id, riskError(err)
	}
	if !allowed {
		return id, huma.Error404NotFound("threat scenario not found")
	}
	return id, nil
}
func riskError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return huma.Error404NotFound("risk resource or related record not found")
	}
	var pgerr *pgconn.PgError
	if errors.As(err, &pgerr) {
		switch pgerr.Code {
		case "23505":
			return huma.Error409Conflict("risk value already exists for this threat and impact rating")
		case "23503":
			return huma.Error409Conflict("resource is referenced or a related record no longer exists")
		case "23514":
			return huma.Error422UnprocessableEntity("risk score or treatment claim violates the risk constraints")
		}
	}
	slog.Error("risk database operation failed", "error", err)
	return huma.Error500InternalServerError("could not process risk resource")
}
func riskOperation(id, method, path, summary string) huma.Operation {
	status := http.StatusOK
	if method == http.MethodPost {
		status = http.StatusCreated
	}
	if method == http.MethodDelete {
		status = http.StatusNoContent
	}
	return huma.Operation{OperationID: id, Method: method, Path: path, Summary: summary, Tags: []string{"Risk"}, DefaultStatus: status,
		Security: []map[string][]string{{"bearer": {}}}, Errors: []int{401, 404, 409, 422, 500}}
}
