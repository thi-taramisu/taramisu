-- Used only by the project import. The name differs from a later CreateThreatScenario on purpose,
-- so that the threat scenario CRUD (#366) can add its own query without a clash.
-- name: ImportThreatScenario :one
INSERT INTO threat_scenario (
    item_definition_id, title, cause_of_compromise, elicitation_method, technical_notes,
    aggregated_attack_feasibility, max_risk_score
)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id;
