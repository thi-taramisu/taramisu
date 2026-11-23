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
SELECT id, name, description, archived_at, created_at, version FROM project;

-- name: GetTaraProject :one
SELECT * FROM tara_project WHERE id = $1 AND deleted_at IS NULL;

-- The project before a settings change, locked until the transaction ends (see LockTaraProject).
-- name: GetTaraProjectForUpdate :one
SELECT * FROM tara_project WHERE id = $1 AND deleted_at IS NULL FOR NO KEY UPDATE;

-- List only projects the caller has a role in, with the caller's highest role. Projects marked as
-- deleted are left out.
-- name: ListTaraProjects :many
SELECT p.id, p.name, p.description, p.archived_at, p.created_at, p.version, max(a.project_role)::project_role AS role
FROM tara_project p
JOIN project_role_assignment a ON a.tara_project_id = p.id
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE p.deleted_at IS NULL
  AND (a.user_id = sqlc.arg(user_id) OR g.external_iam_group_id = ANY(sqlc.arg(group_ids)::text[]))
  AND (sqlc.narg('archived')::boolean IS NULL OR (p.archived_at IS NOT NULL) = sqlc.narg('archived')::boolean)
GROUP BY p.id
ORDER BY p.created_at DESC, p.id;

-- name: ReplaceTaraProject :one
UPDATE tara_project SET version = tara_project.version + 1, name = $2, description = $3 WHERE id = $1 RETURNING *;

-- name: UpdateTaraProject :one
UPDATE tara_project
SET version = tara_project.version + 1, name = COALESCE(sqlc.narg('name'), name),
    description = CASE WHEN sqlc.arg('set_description')::boolean THEN sqlc.narg('description')::text ELSE description END
WHERE id = @id
RETURNING *;

-- Marks the project as deleted: it is hidden from everyone at once and deleted for good after the
-- grace period (PurgeDeletedTaraProjects). Returns the project's name for the audit history; no row
-- if it does not exist or is already marked (the Store's lock on the project finds that first).
-- name: MarkTaraProjectDeleted :one
UPDATE tara_project SET version = tara_project.version + 1, deleted_at = now() WHERE id = $1 AND deleted_at IS NULL
RETURNING id, name;

-- name: ArchiveTaraProject :one
UPDATE tara_project SET version = tara_project.version + 1, archived_at = COALESCE(archived_at, now()) WHERE id = $1 RETURNING *;

-- name: UnarchiveTaraProject :one
UPDATE tara_project SET version = tara_project.version + 1, archived_at = NULL WHERE id = $1 RETURNING *;

-- Takes the mark back; no row if the project does not exist or is not marked as deleted.
-- name: RestoreTaraProject :one
UPDATE tara_project SET version = tara_project.version + 1, deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL
RETURNING id, name;

-- The projects that were marked as deleted before the cutoff, oldest first.
-- name: ListPurgeableTaraProjects :many
SELECT id FROM tara_project WHERE deleted_at < sqlc.arg(cutoff)::timestamptz ORDER BY deleted_at;

-- Lets one replica at a time delete projects for good; released when the transaction ends.
-- name: TryProjectPurgeLock :one
SELECT pg_try_advisory_xact_lock(236001);

-- Deletes one project that was marked as deleted before the cutoff, with all its content
-- (ON DELETE CASCADE). No row if it was restored in the meantime.
-- name: PurgeDeletedTaraProject :one
DELETE FROM tara_project WHERE id = sqlc.arg(id) AND deleted_at < sqlc.arg(cutoff)::timestamptz
RETURNING id;
