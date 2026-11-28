-- Assigns the next display number of the project's threat scenarios (see CreateItemDefinition).
-- Returns no row if the item definition does not exist.
-- name: CreateThreatScenario :one
WITH display AS (
    INSERT INTO display_id_counter (tara_project_id, element_type, last_number)
    SELECT tara_project_id, 'DAMAGE_SCENARIO', 1 FROM item_definition WHERE id = sqlc.arg(item_definition_id)
    ON CONFLICT (tara_project_id, element_type) DO UPDATE SET last_number = display_id_counter.last_number + 1
    RETURNING tara_project_id, last_number
)
INSERT INTO threat_scenario (
    item_definition_id, tara_project_id, display_number, title, cause_of_compromise, elicitation_method, technical_notes
)
SELECT sqlc.arg(item_definition_id), display.tara_project_id, display.last_number,
    sqlc.arg(title), sqlc.narg(cause_of_compromise), sqlc.narg(elicitation_method), sqlc.narg(technical_notes)
FROM display
RETURNING *;

-- name: GetThreatScenario :one
SELECT * FROM threat_scenario WHERE id = $1 AND item_definition_id = $2;

-- name: ListThreatScenarios :many
SELECT * FROM threat_scenario
WHERE item_definition_id = sqlc.arg(item_definition_id)
ORDER BY title, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceThreatScenario :one
UPDATE threat_scenario
SET title = $3, cause_of_compromise = $4, elicitation_method = $5, technical_notes = $6
WHERE id = $1 AND item_definition_id = $2
RETURNING *;

-- name: UpdateThreatScenario :one
UPDATE threat_scenario
SET title = COALESCE(sqlc.narg('title'), title),
    cause_of_compromise = CASE WHEN sqlc.arg('set_cause_of_compromise')::boolean THEN sqlc.narg('cause_of_compromise')::text ELSE cause_of_compromise END,
    elicitation_method = CASE WHEN sqlc.arg('set_elicitation_method')::boolean THEN sqlc.narg('elicitation_method')::elicitation_method ELSE elicitation_method END,
    technical_notes = CASE WHEN sqlc.arg('set_technical_notes')::boolean THEN sqlc.narg('technical_notes')::text ELSE technical_notes END
WHERE id = @id AND item_definition_id = @item_definition_id
RETURNING *;

-- name: DeleteThreatScenario :execrows
DELETE FROM threat_scenario WHERE id = $1 AND item_definition_id = $2;

-- name: GetThreatScenarioForUpdate :one
SELECT * FROM threat_scenario WHERE id = $1 AND item_definition_id = $2
FOR NO KEY UPDATE;

-- name: GetThreatScenarioForDelete :one
SELECT * FROM threat_scenario WHERE id = $1 AND item_definition_id = $2
FOR UPDATE;
