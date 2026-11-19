-- One query per table for the whole project, used by the project export.

-- name: ExportItemDefinitions :many
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id)
ORDER BY created_at, id;

-- name: ExportAssets :many
SELECT a.* FROM asset a
JOIN item_definition i ON i.id = a.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY a.name, a.id;

-- name: ExportAssetCybersecurityProperties :many
SELECT p.* FROM asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
JOIN item_definition i ON i.id = a.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY p.property_type, p.id;

-- name: ExportDamageScenarios :many
SELECT d.* FROM damage_scenario d
JOIN item_definition i ON i.id = d.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY d.title, d.id;

-- name: ExportDamageScenarioAssetProperties :many
SELECT l.* FROM damage_scenario_asset_property l
JOIN damage_scenario d ON d.id = l.damage_scenario_id
JOIN item_definition i ON i.id = d.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY l.id;

-- name: ExportImpactRatings :many
SELECT r.* FROM impact_rating r
JOIN damage_scenario d ON d.id = r.damage_scenario_id
JOIN item_definition i ON i.id = d.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY r.impact_category, r.id;

-- name: ExportThreatScenarios :many
SELECT t.* FROM threat_scenario t
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY t.title, t.id;

-- name: ExportThreatScenarioAssetProperties :many
SELECT l.* FROM threat_scenario_asset_property l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY l.id;

-- name: ExportThreatDamageLinks :many
SELECT l.* FROM threat_damage_link l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY l.id;

-- name: ExportAttackPaths :many
SELECT a.* FROM attack_path a
JOIN item_definition i ON i.id = a.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY a.title, a.id;

-- name: ExportThreatAttackPathLinks :many
SELECT l.* FROM threat_attack_path_link l
JOIN threat_scenario t ON t.id = l.threat_scenario_id
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY l.id;

-- name: ExportAttackFeasibilityRatings :many
SELECT r.* FROM attack_feasibility_rating r
JOIN attack_path a ON a.id = r.attack_path_id
JOIN item_definition i ON i.id = a.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY r.id;

-- name: ExportRiskValues :many
SELECT v.* FROM risk_value v
JOIN threat_scenario t ON t.id = v.threat_scenario_id
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY v.id;

-- name: ExportRiskTreatmentDecisions :many
SELECT d.* FROM risk_treatment_decision d
JOIN threat_scenario t ON t.id = d.threat_scenario_id
JOIN item_definition i ON i.id = t.item_definition_id
WHERE i.tara_project_id = sqlc.arg(project_id)
ORDER BY d.id;
