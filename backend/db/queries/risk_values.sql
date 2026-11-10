-- name: ListRiskValues :many
SELECT * FROM risk_value
WHERE risk_value.threat_scenario_id = sqlc.arg(threat_scenario_id)
ORDER BY id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetRiskValue :one
SELECT * FROM risk_value
WHERE risk_value.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_value.id = sqlc.arg(id);

-- name: CreateRiskValue :one
INSERT INTO risk_value (threat_scenario_id, impact_rating_id, risk_score, determination_method)
SELECT sqlc.arg(threat_scenario_id), sqlc.arg(impact_rating_id), sqlc.arg(risk_score), sqlc.arg(determination_method)
WHERE EXISTS (
    SELECT 1 FROM impact_rating ir
    JOIN damage_scenario d ON d.id = ir.damage_scenario_id
    JOIN threat_scenario t ON t.item_definition_id = d.item_definition_id
    WHERE t.id = sqlc.arg(threat_scenario_id)
      AND ir.id = sqlc.arg(impact_rating_id))
RETURNING *;

-- name: ReplaceRiskValue :one
UPDATE risk_value
SET impact_rating_id = sqlc.arg(impact_rating_id),
    risk_score = sqlc.arg(risk_score),
    determination_method = sqlc.arg(determination_method)
WHERE risk_value.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_value.id = sqlc.arg(id) AND EXISTS (
    SELECT 1 FROM impact_rating ir
    JOIN damage_scenario d ON d.id = ir.damage_scenario_id
    JOIN threat_scenario t ON t.item_definition_id = d.item_definition_id
    WHERE t.id = sqlc.arg(threat_scenario_id)
      AND ir.id = sqlc.arg(impact_rating_id))
RETURNING *;

-- name: PatchRiskValue :one
UPDATE risk_value
SET impact_rating_id = COALESCE(sqlc.narg(impact_rating_id)::uuid, risk_value.impact_rating_id),
    risk_score = COALESCE(sqlc.narg(risk_score)::integer, risk_score),
    determination_method = COALESCE(sqlc.narg(determination_method)::risk_determination_method, determination_method)
WHERE risk_value.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_value.id = sqlc.arg(id) AND EXISTS (
    SELECT 1 FROM impact_rating ir
    JOIN damage_scenario d ON d.id = ir.damage_scenario_id
    JOIN threat_scenario t ON t.item_definition_id = d.item_definition_id
    WHERE t.id = sqlc.arg(threat_scenario_id)
      AND ir.id = COALESCE(sqlc.narg(impact_rating_id)::uuid, risk_value.impact_rating_id))
RETURNING *;

-- name: DeleteRiskValue :one
DELETE FROM risk_value WHERE risk_value.threat_scenario_id = sqlc.arg(threat_scenario_id)
  AND risk_value.id = sqlc.arg(id)
RETURNING id;
