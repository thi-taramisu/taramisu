-- Assigns the next display number of the project's assets (see CreateItemDefinition). Returns no row
-- if the item definition does not exist.
-- name: CreateAsset :one
WITH display AS (
    INSERT INTO display_id_counter (tara_project_id, element_type, last_number)
    SELECT tara_project_id, 'ASSET', 1 FROM item_definition WHERE id = sqlc.arg(item_definition_id)
    ON CONFLICT (tara_project_id, element_type) DO UPDATE SET last_number = display_id_counter.last_number + 1
    RETURNING tara_project_id, last_number
)
INSERT INTO asset (item_definition_id, tara_project_id, display_number, name, description, identification_source)
SELECT sqlc.arg(item_definition_id), display.tara_project_id, display.last_number,
    sqlc.arg(name), sqlc.narg(description), sqlc.narg(identification_source)
FROM display
RETURNING *;

-- name: GetAsset :one
SELECT * FROM asset WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id);

-- name: ListAssets :many
SELECT * FROM asset
WHERE item_definition_id = sqlc.arg(item_definition_id)
ORDER BY id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceAsset :one
UPDATE asset
SET name = sqlc.arg(name), description = sqlc.narg(description), identification_source = sqlc.narg(identification_source)
WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- name: UpdateAsset :one
UPDATE asset
SET name = COALESCE(sqlc.narg(name)::text, name),
    description = CASE WHEN sqlc.arg(set_description)::boolean THEN sqlc.narg(description)::text ELSE description END,
    identification_source = CASE WHEN sqlc.arg(set_identification_source)::boolean THEN sqlc.narg(identification_source)::identification_source ELSE identification_source END
WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id)
RETURNING *;

-- name: DeleteAsset :one
DELETE FROM asset WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id)
RETURNING id;

-- name: GetAssetForUpdate :one
SELECT * FROM asset WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id)
FOR NO KEY UPDATE;

-- name: GetAssetForDelete :one
SELECT * FROM asset WHERE id = sqlc.arg(id) AND item_definition_id = sqlc.arg(item_definition_id)
FOR UPDATE;
