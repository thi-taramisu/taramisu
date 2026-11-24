-- Create the project and make its creator the first Owner in one statement,
-- so a project never exists without an Owner.
-- name: CreateTaraProject :one
WITH project AS (
    INSERT INTO tara_project (name, description, default_rating_method)
    VALUES (sqlc.arg(name), sqlc.narg(description), sqlc.narg(default_rating_method))
    RETURNING *
), owner AS (
    INSERT INTO project_role_assignment (tara_project_id, user_id, project_role)
    SELECT id, sqlc.arg(owner_id), 'OWNER' FROM project
)
SELECT id, name, description, archived_at, default_rating_method, created_at FROM project;

-- name: GetTaraProject :one
SELECT * FROM tara_project WHERE id = $1;

-- The project before a settings change, locked until the transaction ends (see LockTaraProject).
-- name: GetTaraProjectForUpdate :one
SELECT * FROM tara_project WHERE id = $1 FOR NO KEY UPDATE;

-- List only projects the caller has a role in, with the caller's highest role.
-- name: ListTaraProjects :many
SELECT p.id, p.name, p.description, p.archived_at, p.default_rating_method, p.created_at, max(a.project_role)::project_role AS role
FROM tara_project p
JOIN project_role_assignment a ON a.tara_project_id = p.id
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE (a.user_id = sqlc.arg(user_id) OR g.external_iam_group_id = ANY(sqlc.arg(group_ids)::text[]))
AND (sqlc.narg('archived')::boolean IS NULL OR (p.archived_at IS NOT NULL) = sqlc.narg('archived')::boolean)
GROUP BY p.id
ORDER BY p.created_at DESC, p.id;

-- name: ReplaceTaraProject :one
UPDATE tara_project SET name = $2, description = $3, default_rating_method = sqlc.narg(default_rating_method) WHERE id = $1 RETURNING *;

-- name: UpdateTaraProject :one
UPDATE tara_project
SET name = COALESCE(sqlc.narg('name'), name),
    description = CASE WHEN sqlc.arg('set_description')::boolean THEN sqlc.narg('description')::text ELSE description END,
    default_rating_method = CASE WHEN sqlc.arg('set_default_rating_method')::boolean THEN sqlc.narg('default_rating_method')::text ELSE default_rating_method END
WHERE id = @id
RETURNING *;

-- Returns the deleted project's settings for the audit history; no row if it does not exist.
-- name: DeleteTaraProject :one
DELETE FROM tara_project WHERE id = $1
RETURNING id, name;

-- name: ArchiveTaraProject :one
UPDATE tara_project SET archived_at = COALESCE(archived_at, now()) WHERE id = $1 RETURNING *;

-- name: UnarchiveTaraProject :one
UPDATE tara_project SET archived_at = NULL WHERE id = $1 RETURNING *;
