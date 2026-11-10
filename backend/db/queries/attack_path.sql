-- name: CreateAttackPath :one
INSERT INTO attack_path (item_definition_id, title, analysis_approach, is_partial_early_stage, attack_steps_and_weaknesses)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: GetAttackPath :one
SELECT * FROM attack_path WHERE id = $1 AND item_definition_id = $2;

-- name: ListAttackPaths :many
SELECT * FROM attack_path
WHERE item_definition_id = sqlc.arg(item_definition_id)
ORDER BY title, id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceAttackPath :one
UPDATE attack_path
SET title = $3, analysis_approach = $4, is_partial_early_stage = $5, attack_steps_and_weaknesses = $6
WHERE id = $1 AND item_definition_id = $2
RETURNING *;

-- name: UpdateAttackPath :one
UPDATE attack_path
SET title = COALESCE(sqlc.narg('title'), title),
    analysis_approach = CASE WHEN sqlc.arg('set_analysis_approach')::boolean THEN sqlc.narg('analysis_approach')::analysis_approach ELSE analysis_approach END,
    is_partial_early_stage = COALESCE(sqlc.narg('is_partial_early_stage'), is_partial_early_stage),
    attack_steps_and_weaknesses = CASE WHEN sqlc.arg('set_attack_steps_and_weaknesses')::boolean THEN sqlc.narg('attack_steps_and_weaknesses')::jsonb ELSE attack_steps_and_weaknesses END
WHERE id = @id AND item_definition_id = @item_definition_id
RETURNING *;

-- name: DeleteAttackPath :execrows
DELETE FROM attack_path WHERE id = $1 AND item_definition_id = $2;
