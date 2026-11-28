-- name: ListItemDefinitions :many
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id)
ORDER BY created_at, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: GetItemDefinition :one
SELECT * FROM item_definition
WHERE tara_project_id = sqlc.arg(project_id) AND id = sqlc.arg(id);

-- Assigns the next display number of the project's items in the same statement; the counter row
-- stays locked until the transaction ends, so concurrent creations get consecutive numbers. The
-- project is locked first, in the order a project deletion takes the locks, so the two cannot deadlock
-- (docs/internal/architecture/data-model.md#27-display-ids). Returns no row if the project does not exist.
-- name: CreateItemDefinition :one
WITH project AS (
    SELECT p.id FROM tara_project AS p WHERE p.id = sqlc.arg(project_id) FOR KEY SHARE
), display AS (
    INSERT INTO display_id_counter (tara_project_id, element_type, last_number)
    SELECT project.id, 'ITEM', 1 FROM project
    ON CONFLICT (tara_project_id, element_type) DO UPDATE SET last_number = display_id_counter.last_number + 1
    RETURNING tara_project_id, last_number
)
INSERT INTO item_definition (
    tara_project_id, display_number, name, scope_type, lifecycle_phase, boundary, functions, operational_environment,
    item_definition_wp_09_01, cybersecurity_specs_wp_10_01, architectural_design
)
SELECT
    display.tara_project_id, display.last_number, sqlc.arg(name), sqlc.arg(scope_type), sqlc.narg(lifecycle_phase),
    sqlc.narg(boundary), sqlc.narg(functions), sqlc.narg(operational_environment),
    sqlc.narg(item_definition_wp_09_01), sqlc.narg(cybersecurity_specs_wp_10_01), sqlc.narg(architectural_design)
FROM display
RETURNING *;

-- name: ReplaceItemDefinition :one
UPDATE item_definition SET
    version = item_definition.version + 1,
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
    version = item_definition.version + 1,
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
