-- Connect an existing damage scenario and asset property only when both belong to the requested item.
-- Checking the property through its asset prevents references to properties from another item.
-- name: CreateDamageScenarioAssetProperty :one
INSERT INTO damage_scenario_asset_property (damage_scenario_id, asset_cybersecurity_property_id, compromise_mechanism_note)
SELECT d.id, p.id, sqlc.narg(compromise_mechanism_note)
FROM damage_scenario d, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE d.id = sqlc.arg(damage_scenario_id) AND p.id = sqlc.arg(asset_cybersecurity_property_id)
    AND d.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- Read one link, verifying both the scenario and the property belong to the requested item.
-- name: GetDamageScenarioAssetProperty :one
SELECT l.* FROM damage_scenario_asset_property l
JOIN damage_scenario d ON d.id = l.damage_scenario_id
JOIN asset_cybersecurity_property p ON p.id = l.asset_cybersecurity_property_id
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND d.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id);

-- List links whose two references belong to the requested item, ordered by UUID and paginated.
-- name: ListDamageScenarioAssetProperties :many
SELECT l.* FROM damage_scenario_asset_property l
JOIN damage_scenario d ON d.id = l.damage_scenario_id
JOIN asset_cybersecurity_property p ON p.id = l.asset_cybersecurity_property_id
JOIN asset a ON a.id = p.asset_id
WHERE d.item_definition_id = sqlc.arg(item_definition_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY l.id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- Replace the references and optional note while preserving the link ID.
-- old_d/old_p/old_a check the existing link; d/p/a check the replacement references.
-- Both sets must belong to the requested item, so replacement cannot move an out-of-scope link.
-- name: ReplaceDamageScenarioAssetProperty :one
UPDATE damage_scenario_asset_property l
SET damage_scenario_id = sqlc.arg(damage_scenario_id),
    asset_cybersecurity_property_id = sqlc.arg(asset_cybersecurity_property_id),
    compromise_mechanism_note = sqlc.narg(compromise_mechanism_note)
FROM damage_scenario old_d, asset_cybersecurity_property old_p
JOIN asset old_a ON old_a.id = old_p.asset_id,
    damage_scenario d, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND old_d.id = l.damage_scenario_id AND old_p.id = l.asset_cybersecurity_property_id
    AND old_d.item_definition_id = sqlc.arg(item_definition_id) AND old_a.item_definition_id = sqlc.arg(item_definition_id)
    AND d.id = sqlc.arg(damage_scenario_id) AND p.id = sqlc.arg(asset_cybersecurity_property_id)
    AND d.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.*;

-- Update only supplied values; COALESCE keeps omitted references.
-- The note presence flag distinguishes omission from explicit NULL. Check both old and resulting
-- references against the requested item before changing the link.
-- name: UpdateDamageScenarioAssetProperty :one
UPDATE damage_scenario_asset_property l
SET damage_scenario_id = COALESCE(sqlc.narg(damage_scenario_id)::uuid, l.damage_scenario_id),
    asset_cybersecurity_property_id = COALESCE(sqlc.narg(asset_cybersecurity_property_id)::uuid, l.asset_cybersecurity_property_id),
    compromise_mechanism_note = CASE WHEN sqlc.arg(set_compromise_mechanism_note)::boolean
        THEN sqlc.narg(compromise_mechanism_note)::text ELSE l.compromise_mechanism_note END
FROM damage_scenario old_d, asset_cybersecurity_property old_p
JOIN asset old_a ON old_a.id = old_p.asset_id,
    damage_scenario d, asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE l.id = sqlc.arg(id) AND old_d.id = l.damage_scenario_id AND old_p.id = l.asset_cybersecurity_property_id
    AND old_d.item_definition_id = sqlc.arg(item_definition_id) AND old_a.item_definition_id = sqlc.arg(item_definition_id)
    AND d.id = COALESCE(sqlc.narg(damage_scenario_id)::uuid, l.damage_scenario_id)
    AND p.id = COALESCE(sqlc.narg(asset_cybersecurity_property_id)::uuid, l.asset_cybersecurity_property_id)
    AND d.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.*;

-- Delete only the link after checking both references belong to the requested item.
-- The referenced damage scenario and property are preserved.
-- name: DeleteDamageScenarioAssetProperty :one
DELETE FROM damage_scenario_asset_property l USING damage_scenario d, asset_cybersecurity_property p, asset a
WHERE l.id = sqlc.arg(id) AND d.id = l.damage_scenario_id AND p.id = l.asset_cybersecurity_property_id AND a.id = p.asset_id
    AND d.item_definition_id = sqlc.arg(item_definition_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING l.id;
