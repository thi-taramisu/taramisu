-- name: CreateThreatDamageLink :one
INSERT INTO threat_damage_link (threat_scenario_id, damage_scenario_id)
SELECT $1, $2
WHERE EXISTS(SELECT 1 FROM threat_scenario WHERE threat_scenario.id = $1 AND threat_scenario.item_definition_id = $3)
  AND EXISTS(SELECT 1 FROM damage_scenario WHERE damage_scenario.id = $2 AND damage_scenario.item_definition_id = $3)
RETURNING *;

-- name: ListThreatDamageLinks :many
SELECT l.* FROM threat_damage_link l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN damage_scenario d ON d.id = l.damage_scenario_id
WHERE t.item_definition_id = sqlc.arg(item_definition_id) AND d.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY l.id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: DeleteThreatDamageLink :execrows
DELETE FROM threat_damage_link l
WHERE l.id = $1
  AND EXISTS(SELECT 1 FROM threat_scenario t WHERE t.id = l.threat_scenario_id AND t.item_definition_id = $2)
  AND EXISTS(SELECT 1 FROM damage_scenario d WHERE d.id = l.damage_scenario_id AND d.item_definition_id = $2);
