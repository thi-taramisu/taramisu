-- name: CreateAttackPath :one
INSERT INTO attack_path (item_definition_id, title, analysis_approach, is_partial_early_stage, attack_steps_and_weaknesses)
VALUES ($1, $2, $3, $4, $5) RETURNING *;

-- name: GetAttackPath :one
SELECT * FROM attack_path WHERE id = $1 AND item_definition_id = $2;

-- name: ListAttackPaths :many
SELECT * FROM attack_path WHERE item_definition_id = $1 ORDER BY title, id;

-- name: ReplaceAttackPath :one
UPDATE attack_path
SET title = $3, analysis_approach = $4, is_partial_early_stage = $5, attack_steps_and_weaknesses = $6
WHERE id = $1 AND item_definition_id = $2
RETURNING *;

-- name: UpdateAttackPath :one
UPDATE attack_path
SET title = COALESCE(sqlc.narg('title'), title),
    analysis_approach = COALESCE(sqlc.narg('analysis_approach'), analysis_approach),
    is_partial_early_stage = COALESCE(sqlc.narg('is_partial_early_stage'), is_partial_early_stage),
    attack_steps_and_weaknesses = COALESCE(sqlc.narg('attack_steps_and_weaknesses'), attack_steps_and_weaknesses)
WHERE id = @id AND item_definition_id = @item_definition_id
RETURNING *;

-- name: DeleteAttackPath :execrows
DELETE FROM attack_path WHERE id = $1 AND item_definition_id = $2;
