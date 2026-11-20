-- name: CreateDamageScenario :one
INSERT INTO damage_scenario (item_definition_id, title, functionality_adverse_relation, road_user_harm_description)
SELECT $1, $2, $3, $4
WHERE EXISTS(SELECT 1 FROM item_definition WHERE id = $1)
RETURNING *;

-- name: GetDamageScenario :one
SELECT * FROM damage_scenario WHERE id = $1 AND item_definition_id = $2;

-- name: ListDamageScenarios :many
SELECT * FROM damage_scenario
WHERE item_definition_id = sqlc.arg(item_definition_id)
ORDER BY title, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceDamageScenario :one
UPDATE damage_scenario
SET title = $3, functionality_adverse_relation = $4, road_user_harm_description = $5
WHERE id = $1 AND item_definition_id = $2
RETURNING *;

-- name: UpdateDamageScenario :one
UPDATE damage_scenario
SET title = COALESCE(sqlc.narg('title'), title),
    functionality_adverse_relation = CASE WHEN sqlc.arg('set_functionality_adverse_relation')::boolean THEN sqlc.narg('functionality_adverse_relation')::text ELSE functionality_adverse_relation END,
    road_user_harm_description = CASE WHEN sqlc.arg('set_road_user_harm_description')::boolean THEN sqlc.narg('road_user_harm_description')::text ELSE road_user_harm_description END
WHERE id = @id AND item_definition_id = @item_definition_id
RETURNING *;

-- name: DeleteDamageScenario :execrows
DELETE FROM damage_scenario WHERE id = $1 AND item_definition_id = $2;
