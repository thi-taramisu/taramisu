-- Insert a property only if the asset belongs to the requested item definition.
-- INSERT ... SELECT returns no row when the parent does not match, which the API maps to 404.
-- name: CreateAssetCybersecurityProperty :one
INSERT INTO asset_cybersecurity_property (asset_id, property_type, description)
SELECT a.id, sqlc.arg(property_type), sqlc.narg(description)
FROM asset a
WHERE a.id = sqlc.arg(asset_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- Read one property only when its asset and item definition match the URL parents.
-- name: GetAssetCybersecurityProperty :one
SELECT p.* FROM asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE p.id = sqlc.arg(id) AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id);

-- List properties for the URL parents in a stable UUID order, with limit/offset pagination.
-- name: ListAssetCybersecurityProperties :many
SELECT p.* FROM asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE a.id = sqlc.arg(asset_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY p.id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- Replace both editable values, preserving the property ID and owning asset.
-- A NULL description clears the stored text, including when PUT omits the optional field.
-- name: ReplaceAssetCybersecurityProperty :one
UPDATE asset_cybersecurity_property p
SET property_type = sqlc.arg(property_type), description = sqlc.narg(description)
FROM asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.*;

-- Partially update a property: COALESCE preserves an omitted required type.
-- The separate set_description flag distinguishes omission (preserve) from explicit NULL (clear).
-- name: UpdateAssetCybersecurityProperty :one
UPDATE asset_cybersecurity_property p
SET property_type = COALESCE(sqlc.narg(property_type)::cybersecurity_property_type, p.property_type),
    description = CASE WHEN sqlc.arg(set_description)::boolean THEN sqlc.narg(description)::text ELSE p.description END
FROM asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.*;

-- Delete the matching property and return its ID. Existing ON DELETE CASCADE foreign keys
-- also remove its damage/threat links, while the asset and scenarios remain.
-- name: DeleteAssetCybersecurityProperty :one
DELETE FROM asset_cybersecurity_property p USING asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.id;
