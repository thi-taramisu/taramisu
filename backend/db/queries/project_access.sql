-- Project authorization (see docs/internal/architecture/iam/project-roles.md).

-- Highest role of the caller in a project, from a direct assignment or one of the caller's
-- Authentik groups (taramisu_groups claim). Returns no row when the caller has no role.
-- name: GetProjectRole :one
SELECT a.project_role
FROM project_role_assignment a
LEFT JOIN iam_group g ON g.id = a.group_id
WHERE a.tara_project_id = sqlc.arg(project_id)
  AND (a.user_id = sqlc.arg(user_id) OR g.external_iam_group_id = ANY(sqlc.arg(group_ids)::text[]))
ORDER BY a.project_role DESC
LIMIT 1;

-- Project of an item definition; used by handlers below an item definition.
-- name: ProjectIDForItemDefinition :one
SELECT tara_project_id FROM item_definition WHERE id = $1;

-- Project of a threat scenario; used by handlers below a threat scenario.
-- name: ProjectIDForThreatScenario :one
SELECT i.tara_project_id
FROM threat_scenario t
JOIN item_definition i ON i.id = t.item_definition_id
WHERE t.id = $1;
