-- name: GetAttackFeasibilityRating :one
SELECT * FROM attack_feasibility_rating WHERE attack_path_id = $1;

-- name: UpsertAttackFeasibilityRating :one
INSERT INTO attack_feasibility_rating (
    attack_path_id, ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item,
    ap_window_of_opportunity, ap_equipment, ap_total_score, feasibility_rating, rationale
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (attack_path_id) DO UPDATE SET
    ap_elapsed_time = EXCLUDED.ap_elapsed_time,
    ap_specialist_expertise = EXCLUDED.ap_specialist_expertise,
    ap_knowledge_of_item = EXCLUDED.ap_knowledge_of_item,
    ap_window_of_opportunity = EXCLUDED.ap_window_of_opportunity,
    ap_equipment = EXCLUDED.ap_equipment,
    ap_total_score = EXCLUDED.ap_total_score,
    feasibility_rating = EXCLUDED.feasibility_rating,
    rationale = EXCLUDED.rationale
RETURNING *;

-- name: UpdateAttackFeasibilityRating :one
UPDATE attack_feasibility_rating
SET ap_elapsed_time = COALESCE(sqlc.narg('ap_elapsed_time'), ap_elapsed_time),
    ap_specialist_expertise = COALESCE(sqlc.narg('ap_specialist_expertise'), ap_specialist_expertise),
    ap_knowledge_of_item = COALESCE(sqlc.narg('ap_knowledge_of_item'), ap_knowledge_of_item),
    ap_window_of_opportunity = COALESCE(sqlc.narg('ap_window_of_opportunity'), ap_window_of_opportunity),
    ap_equipment = COALESCE(sqlc.narg('ap_equipment'), ap_equipment),
    ap_total_score = COALESCE(sqlc.narg('ap_total_score'), ap_total_score),
    feasibility_rating = COALESCE(sqlc.narg('feasibility_rating'), feasibility_rating),
    rationale = COALESCE(sqlc.narg('rationale'), rationale)
WHERE attack_path_id = @attack_path_id
RETURNING *;

-- name: DeleteAttackFeasibilityRating :execrows
DELETE FROM attack_feasibility_rating WHERE attack_path_id = $1;

-- name: AttackPathBelongsToItem :one
SELECT EXISTS(SELECT 1 FROM attack_path WHERE id = $1 AND item_definition_id = $2) AS belongs;
