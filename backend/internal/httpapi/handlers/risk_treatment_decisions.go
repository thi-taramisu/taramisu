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
	CreateRiskTreatmentDecision(context.Context, db.CreateRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	GetRiskTreatmentDecision(context.Context, db.GetRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	ReplaceRiskTreatmentDecision(context.Context, db.ReplaceRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	PatchRiskTreatmentDecision(context.Context, db.PatchRiskTreatmentDecisionParams) (db.RiskTreatmentDecision, error)
	DeleteRiskTreatmentDecision(context.Context, db.DeleteRiskTreatmentDecisionParams) (pgtype.UUID, error)
	ListRiskTreatmentDecisions(context.Context, db.ListRiskTreatmentDecisionsParams) ([]db.RiskTreatmentDecision, error)
}
type RiskTreatmentDecisions struct {
	store  RiskTreatmentDecisionStore
	access ProjectAccessStore
}

func NewRiskTreatmentDecisions(store RiskTreatmentDecisionStore, access ProjectAccessStore) *RiskTreatmentDecisions {
	return &RiskTreatmentDecisions{store: store, access: access}
}

type RiskTreatmentDecisionBody struct {
	RiskValueID          *string                `json:"risk_value_id,omitempty" format:"uuid" nullable:"true"`
	TreatmentOption      db.RiskTreatmentOption `json:"treatment_option" enum:"AVOIDING,REDUCING,SHARING,RETAINING"`
	DecisionRationale    *string                `json:"decision_rationale,omitempty" nullable:"true"`
	IsCybersecurityClaim bool                   `json:"is_cybersecurity_claim,omitempty"`
}
type PatchRiskTreatmentDecisionBody struct {
	RiskValueID          Optional[string]                 `json:"risk_value_id,omitempty" format:"uuid"`
	TreatmentOption      Optional[db.RiskTreatmentOption] `json:"treatment_option,omitempty" enum:"AVOIDING,REDUCING,SHARING,RETAINING" nullable:"false"`
	DecisionRationale    Optional[string]                 `json:"decision_rationale,omitempty"`
	IsCybersecurityClaim Optional[bool]                   `json:"is_cybersecurity_claim,omitempty" nullable:"false"`
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
	read := InProject(h.access, ScopeThreatScenario, PermRead)
	edit := InProject(h.access, ScopeThreatScenario, PermEdit)
	Register(api, riskOperation("list-risk-treatment-decisions", http.MethodGet, collection, "List risk treatment decisions"), read, h.List)
	Register(api, riskOperation("get-risk-treatment-decision", http.MethodGet, member, "Get risk treatment decision"), read, h.Get)
	Register(api, riskOperation("create-risk-treatment-decision", http.MethodPost, collection, "Create risk treatment decision"), edit, h.Create)
	Register(api, riskOperation("replace-risk-treatment-decision", http.MethodPut, member, "Replace risk treatment decision"), edit, h.Replace)
	Register(api, riskOperation("update-risk-treatment-decision", http.MethodPatch, member, "Patch risk treatment decision"), edit, h.Patch)
	Register(api, riskOperation("delete-risk-treatment-decision", http.MethodDelete, member, "Delete risk treatment decision"), edit, h.Delete)
}
func (h *RiskTreatmentDecisions) List(ctx context.Context, in *RiskListInput) (*ListRiskTreatmentDecisionsOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
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
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.GetRiskTreatmentDecision(ctx, db.GetRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Create(ctx context.Context, in *CreateRiskTreatmentDecisionInput) (*CreateRiskTreatmentDecisionOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.CreateRiskTreatmentDecision(ctx, db.CreateRiskTreatmentDecisionParams{ThreatScenarioID: scenario, RiskValueID: optionalRiskUUID(in.Body.RiskValueID), TreatmentOption: in.Body.TreatmentOption, DecisionRationale: in.Body.DecisionRationale, IsCybersecurityClaim: in.Body.IsCybersecurityClaim})
	if err != nil {
		return nil, riskError(err)
	}
	location := strings.ReplaceAll(riskScenarioPath, "{threat_scenario_id}", scenario.String()) + "/risk-treatment-decisions/" + row.ID.String()
	return &CreateRiskTreatmentDecisionOutput{Location: location, Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Replace(ctx context.Context, in *ReplaceRiskTreatmentDecisionInput) (*RiskTreatmentDecisionOutput, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.ReplaceRiskTreatmentDecision(ctx, db.ReplaceRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), RiskValueID: optionalRiskUUID(in.Body.RiskValueID), TreatmentOption: in.Body.TreatmentOption, DecisionRationale: in.Body.DecisionRationale, IsCybersecurityClaim: in.Body.IsCybersecurityClaim})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Patch(ctx context.Context, in *PatchRiskTreatmentDecisionInput) (*RiskTreatmentDecisionOutput, error) {
	if (in.Body.TreatmentOption.Set && in.Body.TreatmentOption.Value == nil) || (in.Body.IsCybersecurityClaim.Set && in.Body.IsCybersecurityClaim.Value == nil) {
		return nil, huma.Error422UnprocessableEntity("required risk fields cannot be null")
	}

	scenario := riskUUID(in.ThreatScenarioID)
	row, err := h.store.PatchRiskTreatmentDecision(ctx, db.PatchRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID), RiskValueID: optionalRiskUUID(in.Body.RiskValueID.Value), SetRiskValueID: in.Body.RiskValueID.Set, TreatmentOption: in.Body.TreatmentOption.Value, DecisionRationale: in.Body.DecisionRationale.Value, SetDecisionRationale: in.Body.DecisionRationale.Set, IsCybersecurityClaim: in.Body.IsCybersecurityClaim.Value})
	if err != nil {
		return nil, riskError(err)
	}
	return &RiskTreatmentDecisionOutput{Body: toRiskTreatmentDecision(row)}, nil
}
func (h *RiskTreatmentDecisions) Delete(ctx context.Context, in *RiskResourcePath) (*struct{}, error) {
	scenario := riskUUID(in.ThreatScenarioID)
	_, err := h.store.DeleteRiskTreatmentDecision(ctx, db.DeleteRiskTreatmentDecisionParams{ThreatScenarioID: scenario, ID: riskUUID(in.ID)})
	if err != nil {
		return nil, riskError(err)
	}
	return nil, nil
}
