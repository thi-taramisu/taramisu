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
	CreateRiskValue(context.Context, db.CreateRiskValueParams) (db.RiskValue, error)
	GetRiskValue(context.Context, db.GetRiskValueParams) (db.RiskValue, error)
	ReplaceRiskValue(context.Context, db.ReplaceRiskValueParams) (db.RiskValue, error)
	PatchRiskValue(context.Context, db.PatchRiskValueParams) (db.RiskValue, error)
	DeleteRiskValue(context.Context, db.DeleteRiskValueParams) (pgtype.UUID, error)
	ListRiskValues(context.Context, db.ListRiskValuesParams) ([]db.RiskValue, error)
}
type RiskValues struct {
	store  RiskValueStore
	access ProjectAccessStore
}

func NewRiskValues(store RiskValueStore, access ProjectAccessStore) *RiskValues {
	return &RiskValues{store: store, access: access}
}

type RiskValueBody struct {
	ImpactRatingID      string                     `json:"impact_rating_id" format:"uuid"`
	RiskScore           int32                      `json:"risk_score" minimum:"1" maximum:"5"`
	DeterminationMethod db.RiskDeterminationMethod `json:"determination_method" enum:"RISK_MATRIX,RISK_FORMULA"`
}
type PatchRiskValueBody struct {
	ImpactRatingID      Optional[string]                     `json:"impact_rating_id,omitempty" format:"uuid" nullable:"false"`
	RiskScore           Optional[int32]                      `json:"risk_score,omitempty" minimum:"1" maximum:"5" nullable:"false"`
	DeterminationMethod Optional[db.RiskDeterminationMethod] `json:"determination_method,omitempty" enum:"RISK_MATRIX,RISK_FORMULA" nullable:"false"`
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
	read := InProject(h.access, ScopeThreatScenario, PermRead)
	edit := InProject(h.access, ScopeThreatScenario, PermEdit)
	Register(api, riskOperation("list-risk-values", http.MethodGet, collection, "List risk values"), read, h.List)
	Register(api, riskOperation("get-risk-value", http.MethodGet, member, "Get risk value"), read, h.Get)
	Register(api, riskOperation("create-risk-value", http.MethodPost, collection, "Create risk value"), edit, h.Create)
	Register(api, riskOperation("replace-risk-value", http.MethodPut, member, "Replace risk value"), edit, h.Replace)
	Register(api, riskOperation("update-risk-value", http.MethodPatch, member, "Patch risk value"), edit, h.Patch)
	Register(api, riskOperation("delete-risk-value", http.MethodDelete, member, "Delete risk value"), edit, h.Delete)
}
func (h *RiskValues) List(ctx context.Context, in *RiskListInput) (*ListRiskValuesOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
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
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.GetRiskValue(ctx, db.GetRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Create(ctx context.Context, in *CreateRiskValueInput) (*CreateRiskValueOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.CreateRiskValue(ctx, db.CreateRiskValueParams{ThreatScenarioID: scenario, ImpactRatingID: riskUUID(in.Body.ImpactRatingID), RiskScore: in.Body.RiskScore, DeterminationMethod: in.Body.DeterminationMethod})
	if err != nil {
		return nil, riskError(err)
	}
	location := strings.ReplaceAll(riskScenarioPath, "{threat_scenario_id}", scenario.String()) + "/risk-values/" + row.ID.String()
	return &CreateRiskValueOutput{Location: location, Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Replace(ctx context.Context, in *ReplaceRiskValueInput) (*RiskValueOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.ReplaceRiskValue(ctx, db.ReplaceRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), ImpactRatingID: riskUUID(in.Body.ImpactRatingID), RiskScore: in.Body.RiskScore, DeterminationMethod: in.Body.DeterminationMethod})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Patch(ctx context.Context, in *PatchRiskValueInput) (*RiskValueOutput, error) {
	if (in.Body.ImpactRatingID.Set && in.Body.ImpactRatingID.Value == nil) || (in.Body.RiskScore.Set && in.Body.RiskScore.Value == nil) || (in.Body.DeterminationMethod.Set && in.Body.DeterminationMethod.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("required risk fields cannot be null")
	}

	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.PatchRiskValue(ctx, db.PatchRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), ImpactRatingID: optionalRiskUUID(in.Body.ImpactRatingID.Value), RiskScore: in.Body.RiskScore.Value, DeterminationMethod: in.Body.DeterminationMethod.Value})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskValueOutput{Body: toRiskValue(row)}, nil
}
func (h *RiskValues) Delete(ctx context.Context, in *RiskResourcePath) (*struct{}, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	_, err := h.store.DeleteRiskValue(ctx, db.DeleteRiskValueParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return nil, nil
}
