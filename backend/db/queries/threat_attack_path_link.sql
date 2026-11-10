-- name: CreateThreatAttackPathLink :one
INSERT INTO threat_attack_path_link (threat_scenario_id, attack_path_id)
SELECT $1, $2
WHERE EXISTS(SELECT 1 FROM threat_scenario WHERE threat_scenario.id = $1 AND threat_scenario.item_definition_id = $3)
  AND EXISTS(SELECT 1 FROM attack_path WHERE attack_path.id = $2 AND attack_path.item_definition_id = $3)
RETURNING *;

-- name: ListThreatAttackPathLinks :many
SELECT l.* FROM threat_attack_path_link l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN attack_path a ON a.id = l.attack_path_id
WHERE t.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY l.id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: DeleteThreatAttackPathLink :execrows
DELETE FROM threat_attack_path_link l
WHERE l.id = $1
  AND EXISTS(SELECT 1 FROM threat_scenario t WHERE t.id = l.threat_scenario_id AND t.item_definition_id = $2)
  AND EXISTS(SELECT 1 FROM attack_path a WHERE a.id = l.attack_path_id AND a.item_definition_id = $2);
