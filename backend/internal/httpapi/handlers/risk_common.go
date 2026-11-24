package handlers

import (
	"errors"
	"net/http"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
)

const riskScenarioPath = "/api/v1/threat-scenarios/{threat_scenario_id}"

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

func riskUUID(value string) pgtype.UUID {
	var id pgtype.UUID
	// Huma validates request UUIDs before dispatch.
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
	return err // handlers.Register logs it with the request ID and answers with a plain 500
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
