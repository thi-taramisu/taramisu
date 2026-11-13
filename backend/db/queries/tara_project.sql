-- Create the project and make its creator the first Owner in one statement,
-- so a project never exists without an Owner.
-- name: CreateTaraProject :one
WITH project AS (
    INSERT INTO tara_project (name, description)
    VALUES (sqlc.arg(name), sqlc.narg(description))
    RETURNING *
), owner AS (
    INSERT INTO project_role_assignment (tara_project_id, user_id, project_role)
    SELECT id, sqlc.arg(owner_id), 'OWNER' FROM project
)
SELECT id, name, description, created_at FROM project;

-- name: GetTaraProject :one
SELECT * FROM tara_project WHERE id = $1;

-- The project before a settings change, locked until the transaction ends (see LockTaraProject).
-- name: GetTaraProjectForUpdate :one
SELECT * FROM tara_project WHERE id = $1 FOR NO KEY UPDATE;

-- List only projects the caller has a role in, with the caller's highest role.
-- name: ListTaraProjects :many
SELECT p.id, p.name, p.description, p.created_at, max(a.project_role)::project_role AS role
FROM tara_project p
JOIN project_role_assignment a ON a.tara_project_id = p.id
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE a.user_id = sqlc.arg(user_id) OR g.external_iam_group_id = ANY(sqlc.arg(group_ids)::text[])
GROUP BY p.id
ORDER BY p.created_at DESC, p.id;

-- name: ReplaceTaraProject :one
UPDATE tara_project SET name = $2, description = $3 WHERE id = $1 RETURNING *;

-- name: UpdateTaraProject :one
UPDATE tara_project
SET name = COALESCE(sqlc.narg('name'), name),
    description = CASE WHEN sqlc.arg('set_description')::boolean THEN sqlc.narg('description')::text ELSE description END
WHERE id = @id
RETURNING *;

-- Returns the deleted project's settings for the audit history; no row if it does not exist.
-- name: DeleteTaraProject :one
DELETE FROM tara_project WHERE id = $1
RETURNING id, name;
