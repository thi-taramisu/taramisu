-- name: ListRiskTreatmentDecisions :many
SELECT * FROM risk_treatment_decision
WHERE risk_treatment_decision.threat_scenario_id = sqlc.arg(threat_scenario_id)
ORDER BY id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetRiskTreatmentDecision :one
SELECT * FROM risk_treatment_decision
WHERE risk_treatment_decision.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_treatment_decision.id = sqlc.arg(id);

-- name: CreateRiskTreatmentDecision :one
INSERT INTO risk_treatment_decision (threat_scenario_id, risk_value_id, treatment_option, decision_rationale, is_cybersecurity_claim)
SELECT sqlc.arg(threat_scenario_id), sqlc.narg(risk_value_id), sqlc.arg(treatment_option), sqlc.narg(decision_rationale), sqlc.arg(is_cybersecurity_claim)
WHERE (sqlc.narg(risk_value_id)::uuid IS NULL OR EXISTS (
    SELECT 1 FROM risk_value rv WHERE rv.id = sqlc.narg(risk_value_id)
      AND rv.threat_scenario_id = sqlc.arg(threat_scenario_id)))
RETURNING *;

-- name: ReplaceRiskTreatmentDecision :one
UPDATE risk_treatment_decision
SET risk_value_id = sqlc.narg(risk_value_id),
    treatment_option = sqlc.arg(treatment_option),
    decision_rationale = sqlc.narg(decision_rationale),
    is_cybersecurity_claim = sqlc.arg(is_cybersecurity_claim)
WHERE risk_treatment_decision.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_treatment_decision.id = sqlc.arg(id) AND (sqlc.narg(risk_value_id)::uuid IS NULL OR EXISTS (
    SELECT 1 FROM risk_value rv WHERE rv.id = sqlc.narg(risk_value_id)
      AND rv.threat_scenario_id = sqlc.arg(threat_scenario_id)))
RETURNING *;

-- name: PatchRiskTreatmentDecision :one
UPDATE risk_treatment_decision
SET risk_value_id = CASE WHEN sqlc.arg(set_risk_value_id)::boolean THEN sqlc.narg(risk_value_id)::uuid ELSE risk_treatment_decision.risk_value_id END,
    treatment_option = COALESCE(sqlc.narg(treatment_option)::risk_treatment_option, treatment_option),
    decision_rationale = CASE WHEN sqlc.arg(set_decision_rationale)::boolean THEN sqlc.narg(decision_rationale)::text ELSE decision_rationale END,
    is_cybersecurity_claim = COALESCE(sqlc.narg(is_cybersecurity_claim)::boolean, is_cybersecurity_claim)
WHERE risk_treatment_decision.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_treatment_decision.id = sqlc.arg(id) AND (CASE WHEN sqlc.arg(set_risk_value_id)::boolean THEN sqlc.narg(risk_value_id)::uuid ELSE risk_treatment_decision.risk_value_id END::uuid IS NULL OR EXISTS (
    SELECT 1 FROM risk_value rv WHERE rv.id = CASE WHEN sqlc.arg(set_risk_value_id)::boolean THEN sqlc.narg(risk_value_id)::uuid ELSE risk_treatment_decision.risk_value_id END
      AND rv.threat_scenario_id = sqlc.arg(threat_scenario_id)))
RETURNING *;

-- name: DeleteRiskTreatmentDecision :one
DELETE FROM risk_treatment_decision WHERE risk_treatment_decision.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_treatment_decision.id = sqlc.arg(id)
RETURNING id;
