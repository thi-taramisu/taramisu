-- name: CreateAssetCybersecurityProperty :one
INSERT INTO asset_cybersecurity_property (asset_id, property_type, description)
SELECT a.id, sqlc.arg(property_type), sqlc.narg(description)
FROM asset a
WHERE a.id = sqlc.arg(asset_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- name: GetAssetCybersecurityProperty :one
SELECT p.* FROM asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE p.id = sqlc.arg(id) AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id);

-- name: ListAssetCybersecurityProperties :many
SELECT p.* FROM asset_cybersecurity_property p
JOIN asset a ON a.id = p.asset_id
WHERE a.id = sqlc.arg(asset_id) AND a.item_definition_id = sqlc.arg(item_definition_id)
ORDER BY p.id LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceAssetCybersecurityProperty :one
UPDATE asset_cybersecurity_property p
SET property_type = sqlc.arg(property_type), description = sqlc.narg(description)
FROM asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.*;

-- name: UpdateAssetCybersecurityProperty :one
UPDATE asset_cybersecurity_property p
SET property_type = COALESCE(sqlc.narg(property_type)::cybersecurity_property_type, p.property_type),
    description = CASE WHEN sqlc.arg(set_description)::boolean THEN sqlc.narg(description)::text ELSE p.description END
FROM asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.*;

-- name: DeleteAssetCybersecurityProperty :one
DELETE FROM asset_cybersecurity_property p USING asset a
WHERE p.id = sqlc.arg(id) AND a.id = p.asset_id AND a.id = sqlc.arg(asset_id)
    AND a.item_definition_id = sqlc.arg(item_definition_id)
RETURNING p.id;
