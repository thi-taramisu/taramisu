package handlers

import (
	"context"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/thi-taramisu/taramisu/backend/internal/db"
)

type RiskTreatmentDecisionStore interface {
	RiskAccessStore
	CreateRiskTreatmentDecision(context.Context, db.CreateRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	GetRiskTreatmentDecision(context.Context, db.GetRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	ReplaceRiskTreatmentDecision(context.Context, db.ReplaceRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	PatchRiskTreatmentDecision(context.Context, db.PatchRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	DeleteRiskTreatmentDecision(context.Context, db.DeleteRiskTreatmentDecisionParams) (pgtype.UUID, error)
	ListRiskTreatmentDecisions(context.Context, db.ListRiskTreatmentDecisionsParams) ([]db.RiskTreatmentDecision, error)
}
type RiskTreatmentDecisions struct{ store RiskTreatmentDecisionStore }

func NewRiskTreatmentDecisions(store RiskTreatmentDecisionStore) *RiskTreatmentDecisions {
	return &RiskTreatmentDecisions{store: store}
}

type RiskTreatmentDecisionBody struct {
	RiskValueID          *string                `json:"risk_value_id,omitempty" format:"uuid" nullable:"true"`
	TreatmentOption      db.RiskTreatmentOption `json:"treatment_option" enum:"AVOIDING,REDUCING,SHARING,RETAINING"`
	DecisionRationale    *string                `json:"decision_rationale,omitempty" nullable:"true"`
	IsCybersecurityClaim bool                   `json:"is_cybersecurity_claim,omitempty"`
}
type PatchRiskTreatmentDecisionBody struct {
	RiskValueID          nullableRiskField[string]         `json:"risk_value_id,omitempty" format:"uuid"`
	TreatmentOption      riskField[db.RiskTreatmentOption] `json:"treatment_option,omitempty" enum:"AVOIDING,REDUCING,SHARING,RETAINING" nullable:"false"`
	DecisionRationale    nullableRiskField[string]         `json:"decision_rationale,omitempty"`
	IsCybersecurityClaim riskField[bool]                   `json:"is_cybersecurity_claim,omitempty" nullable:"false"`
}
type RiskTreatmentDecision struct {
	ID               string `json:"id" format:"uuid"`
	ThreatScenarioID string `json:"threat_scenario_id" format:"uuid"`
	RiskTreatmentDecisionBody
}
type RiskTreatmentDecisionOutput struct{ Body RiskTreatmentDecision }
type CreateRiskTreatmentDecisionOutput struct {
	Location string `header:"Location"`
	Body     RiskTreatmentDecision
}
type ListRiskTreatmentDecisionsOutput struct{ Body []RiskTreatmentDecision }
type CreateRiskTreatmentDecisionInput struct {
	RiskScenarioPath
	Body RiskTreatmentDecisionBody
}
type ReplaceRiskTreatmentDecisionInput struct {
	RiskResourcePath
	Body RiskTreatmentDecisionBody
}
type PatchRiskTreatmentDecisionInput struct {
	RiskResourcePath
	Body PatchRiskTreatmentDecisionBody
}

func toRiskTreatmentDecision(row db.RiskTreatmentDecision) RiskTreatmentDecision {
	return RiskTreatmentDecision{ID: row.ID.String(), ThreatScenarioID: row.ThreatScenarioID.String(), RiskTreatmentDecisionBody: RiskTreatmentDecisionBody{RiskValueID: riskUUIDString(row.RiskValueID), TreatmentOption: row.TreatmentOption, DecisionRationale: row.DecisionRationale, IsCybersecurityClaim: row.IsCybersecurityClaim}}
}
func (h *RiskTreatmentDecisions) Register(api huma.API) {
	const collection = riskScenarioPath + "/risk-treatment-decisions"
	const member = collection + "/{id}"
	huma.Register(api, riskOperation("list-risk-treatment-decisions", http.MethodGet, collection, "List risk treatment decision"), h.List)
	huma.Register(api, riskOperation("get-risk-treatment-decisions", http.MethodGet, member, "Get risk treatment decision"), h.Get)
	huma.Register(api, riskOperation("create-risk-treatment-decisions", http.MethodPost, collection, "Create risk treatment decision"), h.Create)
	huma.Register(api, riskOperation("replace-risk-treatment-decisions", http.MethodPut, member, "Replace risk treatment decision"), h.Replace)
	huma.Register(api, riskOperation("patch-risk-treatment-decisions", http.MethodPatch, member, "Patch risk treatment decision"), h.Patch)
	huma.Register(api, riskOperation("delete-risk-treatment-decisions", http.MethodDelete, member, "Delete risk treatment decision"), h.Delete)
}
func (h *RiskTreatmentDecisions) List(ctx context.Context, in *RiskListInput) (*ListRiskTreatmentDecisionsOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, true)
	if err != nil {
		return nil, err
	}
	rows, err := h.store.ListRiskTreatmentDecisions(ctx, db.ListRiskTreatmentDecisionsParams{ThreatScenarioID: scenario, PageLimit: in.Limit, PageOffset: in.Offset})
	if err != nil {
		return nil, riskError(err)
	}
	out := &ListRiskTreatmentDecisionsOutput{Body: make([]RiskTreatmentDecision, 0, len(rows))}
	for _, row := range rows {
		out.Body = append(out.Body, toRiskTreatmentDecision(row))
	}
	return out, nil
}
func (h *RiskTreatmentDecisions) Get(ctx context.Context, in *RiskResourcePath) (*RiskTreatmentDecisionOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, true)
	if err != nil {
		return nil, err
	}
	row, err := h.store.GetRiskTreatmentDecision(ctx, db.GetRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Create(ctx context.Context, in *CreateRiskTreatmentDecisionInput) (*CreateRiskTreatmentDecisionOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.CreateRiskTreatmentDecision(ctx, db.CreateRiskTreatmentDecisionParams{ThreatScenarioID: scenario, RiskValueID: optionalRiskUUID(in.Body.RiskValueID), TreatmentOption: in.Body.TreatmentOption, DecisionRationale: in.Body.DecisionRationale, IsCybersecurityClaim: in.Body.IsCybersecurityClaim})
	if err != nil {
		return nil, riskError(err)
	}
	location := strings.ReplaceAll(riskScenarioPath, "{threat_scenario_id}", scenario.String()) + "/risk-treatment-decisions/" + row.ID.String()
	return &CreateRiskTreatmentDecisionOutput{Location: location, Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Replace(ctx context.Context, in *ReplaceRiskTreatmentDecisionInput) (*RiskTreatmentDecisionOutput, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.ReplaceRiskTreatmentDecision(ctx, db.ReplaceRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), RiskValueID: optionalRiskUUID(in.Body.RiskValueID), TreatmentOption: in.Body.TreatmentOption, DecisionRationale: in.Body.DecisionRationale, IsCybersecurityClaim: in.Body.IsCybersecurityClaim})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Patch(ctx context.Context, in *PatchRiskTreatmentDecisionInput) (*RiskTreatmentDecisionOutput, error) {
	if (in.Body.TreatmentOption.Sent && in.Body.TreatmentOption.Value == nil) || (in.Body.IsCybersecurityClaim.Sent && in.Body.IsCybersecurityClaim.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("required risk fields cannot be null")
	}

	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	row, err := h.store.PatchRiskTreatmentDecision(ctx, db.PatchRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), RiskValueID: optionalRiskUUID(in.Body.RiskValueID.Value), SetRiskValueID: in.Body.RiskValueID.Sent, TreatmentOption: in.Body.TreatmentOption.Value, DecisionRationale: in.Body.DecisionRationale.Value, SetDecisionRationale: in.Body.DecisionRationale.Sent, IsCybersecurityClaim: in.Body.IsCybersecurityClaim.Value})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Delete(ctx context.Context, in *RiskResourcePath) (*struct{}, error) {
	scenario, err := authorizeRisk(ctx, h.store, in.ThreatScenarioID, false)
	if err != nil {
		return nil, err
	}
	_, err = h.store.DeleteRiskTreatmentDecision(ctx, db.DeleteRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return nil, nil
}
