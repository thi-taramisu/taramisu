-- Threat scenarios have no API yet; tests create them with this query, which assigns the next
-- display number of the project's threat scenarios (see CreateItemDefinition). Returns no row if the
-- item definition does not exist.
-- name: CreateThreatScenario :one
WITH display AS (
    INSERT INTO display_id_counter (tara_project_id, element_type, last_number)
    SELECT tara_project_id, 'THREAT_SCENARIO', 1 FROM item_definition WHERE id = sqlc.arg(item_definition_id)
    ON CONFLICT (tara_project_id, element_type) DO UPDATE SET last_number = display_id_counter.last_number + 1
    RETURNING tara_project_id, last_number
)
INSERT INTO threat_scenario (item_definition_id, tara_project_id, display_number, title)
SELECT sqlc.arg(item_definition_id), display.tara_project_id, display.last_number, sqlc.arg(title)
FROM display
RETURNING *;
