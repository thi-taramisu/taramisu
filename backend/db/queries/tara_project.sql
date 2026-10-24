-- name: CreateTaraProject :one
INSERT INTO tara_project (name, description) VALUES ($1, $2) RETURNING *;

-- name: GetTaraProject :one
SELECT * FROM tara_project WHERE id = $1;

-- name: ListTaraProjects :many
SELECT * FROM tara_project ORDER BY created_at DESC, id;

-- name: ReplaceTaraProject :one
UPDATE tara_project SET name = $2, description = $3 WHERE id = $1 RETURNING *;

-- name: UpdateTaraProject :one
UPDATE tara_project
SET name = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description)
WHERE id = @id
RETURNING *;

-- name: DeleteTaraProject :execrows
DELETE FROM tara_project WHERE id = $1;
