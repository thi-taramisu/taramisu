-- name: CreateAsset :one
INSERT INTO asset (item_definition_id, name, description, identification_source)
VALUES ($1, $2, $3, $4)
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
