-- Project members: role assignments for users and Authentik groups.

-- name: ListProjectMembers :many
SELECT a.id, a.project_role, a.assigned_at, a.user_id, u.external_iam_sub, g.external_iam_group_id
FROM project_role_assignment a
LEFT JOIN iam_user u ON u.id = a.user_id
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE a.tara_project_id = sqlc.arg(project_id)
ORDER BY a.assigned_at, a.id;

-- name: GetProjectMember :one
SELECT a.id, a.project_role, a.assigned_at, a.user_id, u.external_iam_sub, g.external_iam_group_id
FROM project_role_assignment a
LEFT JOIN iam_user u ON u.id = a.user_id
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE a.tara_project_id = sqlc.arg(project_id) AND a.id = sqlc.arg(id);

-- name: CreateUserMember :one
INSERT INTO project_role_assignment (tara_project_id, user_id, project_role)
VALUES (sqlc.arg(project_id), sqlc.arg(user_id), sqlc.arg(role))
RETURNING id;

-- name: UpsertIAMGroup :one
INSERT INTO iam_group (external_iam_group_id)
VALUES ($1)
ON CONFLICT (external_iam_group_id)
DO UPDATE SET external_iam_group_id = EXCLUDED.external_iam_group_id
RETURNING id;

-- name: CreateGroupMember :one
INSERT INTO project_role_assignment (tara_project_id, group_id, project_role)
VALUES (sqlc.arg(project_id), sqlc.arg(group_id), sqlc.arg(role))
RETURNING id;

-- Change a role unless that would remove the last user Owner. Group Owners do not count,
-- because their membership can change in Authentik. Returns no row if the assignment does not
-- exist or is protected; the handler tells both cases apart with GetProjectMember.
-- previous_role is the role before the change (the joined row is read before the update), for the audit log.
-- name: UpdateProjectMemberRole :one
UPDATE project_role_assignment a
SET project_role = sqlc.arg(role)
FROM project_role_assignment previous
WHERE previous.id = a.id AND a.tara_project_id = sqlc.arg(project_id) AND a.id = sqlc.arg(id)
  AND (sqlc.arg(role)::project_role = 'OWNER' OR a.user_id IS NULL OR a.project_role <> 'OWNER' OR EXISTS (
      SELECT 1 FROM project_role_assignment o
      WHERE o.tara_project_id = a.tara_project_id AND o.id <> a.id
        AND o.user_id IS NOT NULL AND o.project_role = 'OWNER'))
RETURNING a.id, previous.project_role AS previous_role;

-- Remove an assignment unless it is the last user Owner (same rule as UpdateProjectMemberRole).
-- name: DeleteProjectMember :one
DELETE FROM project_role_assignment a
WHERE a.tara_project_id = sqlc.arg(project_id) AND a.id = sqlc.arg(id)
  AND (a.user_id IS NULL OR a.project_role <> 'OWNER' OR EXISTS (
      SELECT 1 FROM project_role_assignment o
      WHERE o.tara_project_id = a.tara_project_id AND o.id <> a.id
        AND o.user_id IS NOT NULL AND o.project_role = 'OWNER'))
RETURNING a.id, a.project_role;

-- Serializes membership changes per project. Store.UpdateProjectMemberRole and
-- Store.DeleteProjectMember take this lock before the guarded statement, so two Owners cannot
-- downgrade or remove each other at the same moment.
-- name: LockTaraProject :one
SELECT id FROM tara_project WHERE id = $1 FOR UPDATE;
