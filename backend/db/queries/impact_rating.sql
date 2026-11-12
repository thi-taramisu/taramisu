-- name: CreateImpactRating :one
INSERT INTO impact_rating (damage_scenario_id, impact_category, rating_value, is_omitted_by_pm_15_07, omission_or_rating_rationale, reused_from_functional_safety)
SELECT $1, $3, $4, $5, $6, $7
WHERE EXISTS(SELECT 1 FROM damage_scenario WHERE damage_scenario.id = $1 AND damage_scenario.item_definition_id = $2)
RETURNING *;

-- name: GetImpactRating :one
SELECT r.* FROM impact_rating r
JOIN damage_scenario d ON d.id = r.damage_scenario_id
WHERE r.id = $1 AND r.damage_scenario_id = $2 AND d.item_definition_id = $3;

-- name: ListImpactRatings :many
SELECT r.* FROM impact_rating r
JOIN damage_scenario d ON d.id = r.damage_scenario_id
WHERE r.damage_scenario_id = $1 AND d.item_definition_id = $2
ORDER BY r.impact_category, r.id
LIMIT sqlc.arg(page_limit) OFFSET sqlc.arg(page_offset);

-- name: ReplaceImpactRating :one
UPDATE impact_rating
SET impact_category = $4, rating_value = $5, is_omitted_by_pm_15_07 = $6,
    omission_or_rating_rationale = $7, reused_from_functional_safety = $8
WHERE impact_rating.id = $1 AND impact_rating.damage_scenario_id = $2
  AND EXISTS(SELECT 1 FROM damage_scenario WHERE damage_scenario.id = $2 AND damage_scenario.item_definition_id = $3)
RETURNING *;

-- name: UpdateImpactRating :one
UPDATE impact_rating
SET impact_category = COALESCE(sqlc.narg('impact_category'), impact_category),
    rating_value = COALESCE(sqlc.narg('rating_value'), rating_value),
    is_omitted_by_pm_15_07 = COALESCE(sqlc.narg('is_omitted_by_pm_15_07'), is_omitted_by_pm_15_07),
    omission_or_rating_rationale = CASE WHEN sqlc.arg('set_omission_or_rating_rationale')::boolean THEN sqlc.narg('omission_or_rating_rationale')::text ELSE omission_or_rating_rationale END,
    reused_from_functional_safety = COALESCE(sqlc.narg('reused_from_functional_safety'), reused_from_functional_safety)
WHERE impact_rating.id = @id AND impact_rating.damage_scenario_id = @damage_scenario_id
  AND EXISTS(SELECT 1 FROM damage_scenario WHERE damage_scenario.id = @damage_scenario_id AND damage_scenario.item_definition_id = @item_definition_id)
RETURNING *;

-- name: DeleteImpactRating :execrows
DELETE FROM impact_rating
WHERE impact_rating.id = $1 AND impact_rating.damage_scenario_id = $2
  AND EXISTS(SELECT 1 FROM damage_scenario WHERE damage_scenario.id = $2 AND damage_scenario.item_definition_id = $3);
