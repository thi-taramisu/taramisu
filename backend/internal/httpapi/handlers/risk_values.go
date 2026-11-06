package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type RiskValueStore interface {
	RiskAccessStore
	CreateRiskValue(context.Context, db.CreateRiskValueParams) (db.RiskValue, error)
	GetRiskValue(context.Context, db.GetRiskValueParams) (db.RiskValue, error)
	ReplaceRiskValue(context.Context, db.ReplaceRiskValueParams) (db.RiskValue, error)
	PatchRiskValue(context.Context, db.PatchRiskValueParams) (db.RiskValue, error)
	DeleteRiskValue(context.Context, db.DeleteRiskValueParams) (pgtype.UUID, error)
	ListRiskValues(context.Context, db.ListRiskValuesParams) ([]db.RiskValue, error)
}
type RiskValues struct{ store RiskValueStore }

func NewRiskValues(store RiskValueStore) *RiskValues { return &RiskValues{store: store} }

type RiskValueBody struct {
	ImpactRatingID      string                     `json:"impact_rating_id" format:"uuid"`
	RiskScore           int32                      `json:"risk_score" minimum:"1" maximum:"5"`
	DeterminationMethod db.RiskDeterminationMethod `json:"determination_method" enum:"RISK_MATRIX,RISK_FORMULA"`
}
type PatchRiskValueBody struct {
	ImpactRatingID      riskField[string]                     `json:"impact_rating_id,omitempty" format:"uuid" nullable:"false"`
	RiskScore           riskField[int32]                      `json:"risk_score,omitempty" minimum:"1" maximum:"5" nullable:"false"`
	DeterminationMethod riskField[db.RiskDeterminationMethod] `json:"determination_method,omitempty" enum:"RISK_MATRIX,RISK_FORMULA" nullable:"false"`
}
type RiskValue struct {
	ID               string `json:"id" format:"uuid"`
	ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
	RiskValueBody
}
type RiskValueOutput struct{ Body RiskValue }
type CreateRiskValueOutput struct {
	Location string `header:"Location"`
	Body     RiskValue
}
type ListRiskValuesOutput struct{ Body []RiskValue }
type CreateRiskValueInput struct {
	RiskScenarioPath
	Body RiskValueBody
}
type ReplaceRiskValueInput struct {
	RiskResourcePath
	Body RiskValueBody
}
type PatchRiskValueInput struct {
	RiskResourcePath
	Body PatchRiskValueBody
}

func toRiskValue(row db.RiskValue) RiskValue {
	return RiskValue{ID: row.ID.String(), ThreatScenarioID: row.ThreatScenarioID.String(), RiskValueBody: RiskValueBody{ImpactRatingID: row.ImpactRatingID.String(), RiskScore: row.RiskScore, DeterminationMethod: row.DeterminationMethod}}
}
func (h *RiskValues) Register(api huma.API) {
	const collection = riskScenarioPath + "/risk-values"
	const member = collection + "/{id}"
	huma.Register(api, riskOperation("list-risk-values", http.MethodGet, collection, "List risk value"), h.List)
	huma.Register(api, riskOperation("get-risk-values", http.MethodGet, member, "Get risk value"), h.Get)
	huma.Register(api, riskOperation("create-risk-values", http.MethodPost, collection, "Create risk value"), h.Create)
	huma.Register(api, riskOperation("replace-risk-values", http.MethodPut, member, "Replace risk value"), h.Replace)
	huma.Register(api, riskOperation("patch-risk-values", http.MethodPatch, member, "Patch risk value"), h.Patch)
	huma.Register(api, riskOperation("delete-risk-values", http.MethodDelete, member, "Delete risk value"), h.Delete)
}
func (h *RiskValues) List(ctx context.Context, in *RiskListInput) (*ListRiskValuesOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, true)
	if err != nil {
		return nil, err
	}
	rows, err := h.store.ListRiskValues(ctx, db.ListRiskValuesParams{ThreatScenarioID: scenario, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, riskError(err)
	}
	out := &ListRiskValuesOutput{Body: make([]RiskValue, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, toRiskValue(row))
	}
	return out, nil
}
func (h *RiskValues) Get(ctx context.Context, in *RiskResourcePath) (*RiskValueOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, true)
	if err != nil {
		return nil, err
	}
	row, err := h.store.GetRiskValue(ctx, db.GetRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Create(ctx context.Context, in *CreateRiskValueInput) (*CreateRiskValueOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.CreateRiskValue(ctx, db.CreateRiskValueParams{ThreatScenarioID: scenario, ImpactRatingID: riskUUID(in.Body.ImpactRatingID), RiskScore: in.Body.RiskScore, DeterminationMethod: in.Body.DeterminationMethod})
	if err != nil {
		return nil, riskError(err)
	}
	location := strings.ReplaceAll(riskScenarioPath, "{threat_scenario_id}", scenario.String()) + "/risk-values/" + row.ID.String()
	return &CreateRiskValueOutput{Location: location, Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Replace(ctx context.Context, in *ReplaceRiskValueInput) (*RiskValueOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.ReplaceRiskValue(ctx, db.ReplaceRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), ImpactRatingID: riskUUID(in.Body.ImpactRatingID), RiskScore: in.Body.RiskScore, DeterminationMethod: in.Body.DeterminationMethod})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Patch(ctx context.Context, in *PatchRiskValueInput) (*RiskValueOutput, error) {
	if (in.Body.ImpactRatingID.Sent && in.Body.ImpactRatingID.Value == nil) || (in.Body.RiskScore.Sent && in.Body.RiskScore.Value == nil) || (in.Body.DeterminationMethod.Sent && in.Body.DeterminationMethod.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("required risk fields cannot be null")
	}

	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.PatchRiskValue(ctx, db.PatchRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), ImpactRatingID: optionalRiskUUID(in.Body.ImpactRatingID.Value), RiskScore: in.Body.RiskScore.Value, DeterminationMethod: in.Body.DeterminationMethod.Value})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Delete(ctx context.Context, in *RiskResourcePath) (*struct{}, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	_, err = h.store.DeleteRiskValue(ctx, db.DeleteRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return nil, nil
}
