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
    tara_project_id, name, scope_type, lifecycle_phase, boundary, functions, operational_environment,
    item_definition_wp_09_01, cybersecurity_specs_wp_10_01, architectural_design
) VALUES (
    sqlc.arg(project_id), sqlc.arg(name), sqlc.arg(scope_type), sqlc.narg(lifecycle_phase),
    sqlc.narg(boundary), sqlc.narg(functions), sqlc.narg(operational_environment),
    sqlc.narg(item_definition_wp_09_01), sqlc.narg(cybersecurity_specs_wp_10_01), sqlc.narg(architectural_design)
) RETURNING *;

-- name: ReplaceItemDefinition :one
UPDATE item_definition SET
    name = sqlc.arg(name), scope_type = sqlc.arg(scope_type),
    lifecycle_phase = sqlc.narg(lifecycle_phase),
    boundary = sqlc.narg(boundary),
    functions = sqlc.narg(functions),
    operational_environment = sqlc.narg(operational_environment),
    item_definition_wp_09_01 = sqlc.narg(item_definition_wp_09_01),
    cybersecurity_specs_wp_10_01 = sqlc.narg(cybersecurity_specs_wp_10_01),
    architectural_design = sqlc.narg(architectural_design)
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: PatchItemDefinition :one
UPDATE item_definition SET
    name = COALESCE(sqlc.narg(name)::text, name),
    scope_type = COALESCE(sqlc.narg(scope_type)::scope_type, scope_type),
    boundary = CASE WHEN sqlc.arg(set_boundary)::boolean THEN sqlc.narg(boundary)::text ELSE boundary END,
    functions = CASE WHEN sqlc.arg(set_functions)::boolean THEN sqlc.narg(functions)::text ELSE functions END,
    operational_environment = CASE WHEN sqlc.arg(set_operational_environment)::boolean THEN sqlc.narg(operational_environment)::text ELSE operational_environment END,
    lifecycle_phase = CASE WHEN sqlc.arg(set_lifecycle_phase)::boolean THEN sqlc.narg(lifecycle_phase)::text ELSE lifecycle_phase END,
    item_definition_wp_09_01 = CASE WHEN sqlc.arg(set_item_definition)::boolean THEN sqlc.narg(item_definition_wp_09_01)::text ELSE item_definition_wp_09_01 END,
    cybersecurity_specs_wp_10_01 = CASE WHEN sqlc.arg(set_cybersecurity_specs)::boolean THEN sqlc.narg(cybersecurity_specs_wp_10_01)::text ELSE cybersecurity_specs_wp_10_01 END,
    architectural_design = CASE WHEN sqlc.arg(set_architectural_design)::boolean THEN sqlc.narg(architectural_design)::text ELSE architectural_design END
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
RETURNING *;

-- name: DeleteItemDefinition :execrows
DELETE FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id);

-- The item definition before a change, locked until the transaction ends, so that the audit history
-- records the state the change replaced.
-- name: GetItemDefinitionForUpdate :one
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
FOR NO KEY UPDATE;

-- The item definition before its deletion, locked with FOR UPDATE at once, so the deletion waits for
-- concurrent inserts of dependent records instead of deadlocking with them.
-- name: GetItemDefinitionForDelete :one
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id)
FOR UPDATE;
