-- name: CreateThreatScenarioAssetProperty :one
INSERT INTO threat_scenario_asset_property (threat_scenario_id, asset_cybersecurity_property_id)
SELECT t.id, p.id
FROM threat_scenario t, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE t.id = sqlc.arg(threat_scenario_id) AND p.id = sqlc.arg(asset_cybersecurity_property_id)
    AND t.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- name: GetThreatScenarioAssetProperty :one
SELECT l.* FROM threat_scenario_asset_property l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN asset_cybersecurity_property p ON p.id = l.asset_cybersecurity_property_id
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND t.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id);

-- name: ListThreatScenarioAssetProperties :many
SELECT l.* FROM threat_scenario_asset_property l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN asset_cybersecurity_property p ON p.id = l.asset_cybersecurity_property_id
JOIN asset a ON a.id = p.asset_id
WHERE t.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY l.id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceThreatScenarioAssetProperty :one
UPDATE threat_scenario_asset_property l
SET threat_scenario_id = sqlc.arg(threat_scenario_id), asset_cybersecurity_property_id = sqlc.arg(asset_cybersecurity_property_id)
FROM threat_scenario old_t, asset_cybersecurity_property old_p
JOIN asset old_a ON old_a.id = old_p.asset_id,
    threat_scenario t, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND old_t.id = l.threat_scenario_id AND old_p.id = l.asset_cybersecurity_property_id
    AND old_t.item_definition_id = sqlc.arg(item_definition_id) AND old_a.item_definition_id = sqlc.arg(item_definition_id)
    AND t.id = sqlc.arg(threat_scenario_id) AND p.id = sqlc.arg(asset_cybersecurity_property_id)
    AND t.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.*;

-- name: UpdateThreatScenarioAssetProperty :one
UPDATE threat_scenario_asset_property l
SET threat_scenario_id = COALESCE(sqlc.narg(threat_scenario_id)::uuid, l.threat_scenario_id),
    asset_cybersecurity_property_id = COALESCE(sqlc.narg(asset_cybersecurity_property_id)::uuid, l.asset_cybersecurity_property_id)
FROM threat_scenario old_t, asset_cybersecurity_property old_p
JOIN asset old_a ON old_a.id = old_p.asset_id,
    threat_scenario t, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND old_t.id = l.threat_scenario_id AND old_p.id = l.asset_cybersecurity_property_id
    AND old_t.item_definition_id = sqlc.arg(item_definition_id) AND old_a.item_definition_id = sqlc.arg(item_definition_id)
    AND t.id = COALESCE(sqlc.narg(threat_scenario_id)::uuid, l.threat_scenario_id)
    AND p.id = COALESCE(sqlc.narg(asset_cybersecurity_property_id)::uuid, l.asset_cybersecurity_property_id)
    AND t.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.*;

-- name: DeleteThreatScenarioAssetProperty :one
DELETE FROM threat_scenario_asset_property l USING threat_scenario t, asset_cybersecurity_property p, asset a
WHERE l.id = sqlc.arg(id) AND t.id = l.threat_scenario_id AND p.id = l.asset_cybersecurity_property_id AND a.id = p.asset_id
    AND t.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.id;
