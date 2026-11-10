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
SET ap_elapsed_time = CASE WHEN sqlc.arg('set_ap_elapsed_time')::boolean THEN sqlc.narg('ap_elapsed_time')::integer ELSE ap_elapsed_time END,
    ap_specialist_expertise = CASE WHEN sqlc.arg('set_ap_specialist_expertise')::boolean THEN sqlc.narg('ap_specialist_expertise')::integer ELSE ap_specialist_expertise END,
    ap_knowledge_of_item = CASE WHEN sqlc.arg('set_ap_knowledge_of_item')::boolean THEN sqlc.narg('ap_knowledge_of_item')::integer ELSE ap_knowledge_of_item END,
    ap_window_of_opportunity = CASE WHEN sqlc.arg('set_ap_window_of_opportunity')::boolean THEN sqlc.narg('ap_window_of_opportunity')::integer ELSE ap_window_of_opportunity END,
    ap_equipment = CASE WHEN sqlc.arg('set_ap_equipment')::boolean THEN sqlc.narg('ap_equipment')::integer ELSE ap_equipment END,
    ap_total_score = CASE WHEN sqlc.arg('set_ap_total_score')::boolean THEN sqlc.narg('ap_total_score')::integer ELSE ap_total_score END,
    feasibility_rating = CASE WHEN sqlc.arg('set_feasibility_rating')::boolean THEN sqlc.narg('feasibility_rating')::attack_feasibility ELSE feasibility_rating END,
    rationale = CASE WHEN sqlc.arg('set_rationale')::boolean THEN sqlc.narg('rationale')::text ELSE rationale END
WHERE attack_path_id = @attack_path_id
RETURNING *;

-- name: DeleteAttackFeasibilityRating :execrows
DELETE FROM attack_feasibility_rating WHERE attack_path_id = $1;

-- name: AttackPathBelongsToItem :one
SELECT EXISTS(SELECT 1 FROM attack_path WHERE id = $1 AND item_definition_id = $2) AS belongs;
