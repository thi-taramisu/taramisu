-- name: CanAccessItemDefinitions :one
SELECT EXISTS (
    SELECT 1 FROM project_role_assignment AS role
    WHERE role.tara_project_id = sqlc.arg(project_id)
      AND (role.user_id = sqlc.arg(user_id) OR role.group_id IN (
          SELECT group_id FROM iam_user_group_member WHERE user_id = sqlc.arg(user_id)
      ))
      AND (sqlc.arg(read_only)::boolean OR role.project_role IN ('OWNER', 'EDITOR'))
);

-- name: ListItemDefinitions :many
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id)
ORDER BY created_at, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetItemDefinition :one
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id);

-- name: CreateItemDefinition :one
INSERT INTO item_definition (
    tara_project_id, name, scope_type, lifecycle_phase,
    item_definition_wp_09_01, cybersecurity_specs_wp_10_01, architectural_design
) VALUES (
    sqlc.arg(project_id), sqlc.arg(name), sqlc.arg(scope_type), sqlc.narg(lifecycle_phase),
    sqlc.narg(item_definition_wp_09_01), sqlc.narg(cybersecurity_specs_wp_10_01), sqlc.narg(architectural_design)
) RETURNING *;

-- name: ReplaceItemDefinition :one
UPDATE item_definition SET
    name = sqlc.arg(name), scope_type = sqlc.arg(scope_type),
    lifecycle_phase = sqlc.narg(lifecycle_phase),
    item_definition_wp_09_01 = sqlc.narg(item_definition_wp_09_01),
    cybersecurity_specs_wp_10_01 = sqlc.narg(cybersecurity_specs_wp_10_01),
    architectural_design = sqlc.narg(architectural_design)
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: PatchItemDefinition :one
UPDATE item_definition SET
    name = COALESCE(sqlc.narg(name)::text, name),
    scope_type = COALESCE(sqlc.narg(scope_type)::scope_type, scope_type),
    lifecycle_phase = CASE WHEN sqlc.arg(set_lifecycle_phase)::boolean THEN sqlc.narg(lifecycle_phase)::text ELSE lifecycle_phase END,
    item_definition_wp_09_01 = CASE WHEN sqlc.arg(set_item_definition)::boolean THEN sqlc.narg(item_definition_wp_09_01)::text ELSE item_definition_wp_09_01 END,
    cybersecurity_specs_wp_10_01 = CASE WHEN sqlc.arg(set_cybersecurity_specs)::boolean THEN sqlc.narg(cybersecurity_specs_wp_10_01)::text ELSE cybersecurity_specs_wp_10_01 END,
    architectural_design = CASE WHEN sqlc.arg(set_architectural_design)::boolean THEN sqlc.narg(architectural_design)::text ELSE architectural_design END
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: DeleteItemDefinition :execrows
DELETE FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id);
