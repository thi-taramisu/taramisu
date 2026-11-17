-- name: GetAttackFeasibilityRating :one
SELECT * FROM attack_feasibility_rating WHERE attack_path_id = $1;

-- CVSS v3.1 exploitability = 8.22 * AV * AC * PR * UI (FIRST specification).
-- Feasibility adopts ISO/SAE 21434:2021 Annex G, Table G.8 example cutoffs:
-- HIGH >=2.96, MEDIUM >=2.00, LOW >=1.06, otherwise VERY_LOW.
-- Compare full-precision scores; these are not CVSS base-score severity bands.
-- AP policy thresholds: 13/19/24. Complete inputs determine feasibility_rating;
-- the legacy feasibility_rating parameter is accepted but never overrides it.
-- name: UpsertAttackFeasibilityRating :one
-- Build the complete replacement row from PUT parameters. sqlc.narg allows NULL.
WITH proposed AS (
    SELECT sqlc.arg('attack_path_id')::uuid AS attack_path_id,
        sqlc.narg('ap_elapsed_time')::integer AS ap_elapsed_time,
        sqlc.narg('ap_specialist_expertise')::integer AS ap_specialist_expertise,
        sqlc.narg('ap_knowledge_of_item')::integer AS ap_knowledge_of_item,
        sqlc.narg('ap_window_of_opportunity')::integer AS ap_window_of_opportunity,
        sqlc.narg('ap_equipment')::integer AS ap_equipment,
        sqlc.narg('ap_total_score')::integer AS ap_total_score,
        sqlc.narg('feasibility_rating')::attack_feasibility AS feasibility_rating,
        sqlc.narg('rationale')::text AS rationale,
        COALESCE(sqlc.narg('rating_method')::text,
            (SELECT initial_rating_method FROM attack_path WHERE id = sqlc.arg('attack_path_id'))) AS rating_method,
        sqlc.narg('cvss_attack_vector')::text AS cvss_attack_vector,
        sqlc.narg('cvss_attack_complexity')::text AS cvss_attack_complexity,
        sqlc.narg('cvss_privileges_required')::text AS cvss_privileges_required,
        sqlc.narg('cvss_user_interaction')::text AS cvss_user_interaction,
        sqlc.narg('cvss_scope')::text AS cvss_scope,
        sqlc.narg('attack_vector')::text AS attack_vector
), scored AS (
    -- Missing AP factors propagate NULL, leaving incomplete drafts unrated.
    -- bigint prevents overflow during summation; the existing AP checks still apply.
    -- CVSS Scope selects the privileges weight; inputs are checked by the table.
    SELECT proposed.*, ap_elapsed_time::bigint + ap_specialist_expertise + ap_knowledge_of_item + ap_window_of_opportunity + ap_equipment AS ap_score,
    8.22
        * CASE cvss_attack_vector WHEN 'NETWORK' THEN 0.85 WHEN 'ADJACENT' THEN 0.62 WHEN 'LOCAL' THEN 0.55 ELSE 0.20 END
        * CASE cvss_attack_complexity WHEN 'LOW' THEN 0.77 ELSE 0.44 END
        * CASE cvss_privileges_required WHEN 'NONE' THEN 0.85
            WHEN 'LOW' THEN CASE WHEN cvss_scope = 'CHANGED' THEN 0.68 ELSE 0.62 END
            ELSE CASE WHEN cvss_scope = 'CHANGED' THEN 0.50 ELSE 0.27 END END
        * CASE cvss_user_interaction WHEN 'NONE' THEN 0.85 ELSE 0.62 END AS cvss_score FROM proposed
)
INSERT INTO attack_feasibility_rating (attack_path_id, ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score, feasibility_rating, rationale, rating_method, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope, attack_vector)
SELECT attack_path_id, ap_elapsed_time, ap_specialist_expertise, ap_knowledge_of_item, ap_window_of_opportunity, ap_equipment, ap_total_score, CASE rating_method
    WHEN 'ATTACK_POTENTIAL' THEN CASE WHEN ap_score IS NULL THEN NULL
        WHEN ap_score <= 13 THEN 'HIGH' WHEN ap_score <= 19 THEN 'MEDIUM'
        WHEN ap_score <= 24 THEN 'LOW' ELSE 'VERY_LOW' END
    WHEN 'CVSS' THEN CASE WHEN cvss_score >= 2.96 THEN 'HIGH'
        WHEN cvss_score >= 2.00 THEN 'MEDIUM' WHEN cvss_score >= 1.06 THEN 'LOW' ELSE 'VERY_LOW' END
    WHEN 'ATTACK_VECTOR' THEN CASE attack_vector WHEN 'NETWORK' THEN 'HIGH'
        WHEN 'ADJACENT' THEN 'MEDIUM' WHEN 'LOCAL' THEN 'LOW' ELSE 'VERY_LOW' END
    END::attack_feasibility, rationale, rating_method, cvss_attack_vector, cvss_attack_complexity, cvss_privileges_required, cvss_user_interaction, cvss_scope, attack_vector FROM scored
-- Each attack path has at most one rating. Replace all fields on an existing row.
ON CONFLICT (attack_path_id) DO UPDATE SET
    ap_elapsed_time = EXCLUDED.ap_elapsed_time,
    ap_specialist_expertise = EXCLUDED.ap_specialist_expertise,
    ap_knowledge_of_item = EXCLUDED.ap_knowledge_of_item,
    ap_window_of_opportunity = EXCLUDED.ap_window_of_opportunity,
    ap_equipment = EXCLUDED.ap_equipment,
    ap_total_score = EXCLUDED.ap_total_score,
    feasibility_rating = EXCLUDED.feasibility_rating,
    rationale = EXCLUDED.rationale,
    rating_method = EXCLUDED.rating_method,
    cvss_attack_vector = EXCLUDED.cvss_attack_vector,
    cvss_attack_complexity = EXCLUDED.cvss_attack_complexity,
    cvss_privileges_required = EXCLUDED.cvss_privileges_required,
    cvss_user_interaction = EXCLUDED.cvss_user_interaction,
    cvss_scope = EXCLUDED.cvss_scope,
    attack_vector = EXCLUDED.attack_vector
RETURNING *;

-- name: UpdateAttackFeasibilityRating :one
-- Merge PATCH fields before scoring: set=false retains the column; set=true
-- accepts the supplied value, including NULL. Table checks validate the merged row.
WITH proposed AS (
    SELECT current.attack_path_id,
        CASE WHEN sqlc.arg('set_ap_elapsed_time')::boolean THEN sqlc.narg('ap_elapsed_time')::integer ELSE current.ap_elapsed_time END AS ap_elapsed_time,
        CASE WHEN sqlc.arg('set_ap_specialist_expertise')::boolean THEN sqlc.narg('ap_specialist_expertise')::integer ELSE current.ap_specialist_expertise END AS ap_specialist_expertise,
        CASE WHEN sqlc.arg('set_ap_knowledge_of_item')::boolean THEN sqlc.narg('ap_knowledge_of_item')::integer ELSE current.ap_knowledge_of_item END AS ap_knowledge_of_item,
        CASE WHEN sqlc.arg('set_ap_window_of_opportunity')::boolean THEN sqlc.narg('ap_window_of_opportunity')::integer ELSE current.ap_window_of_opportunity END AS ap_window_of_opportunity,
        CASE WHEN sqlc.arg('set_ap_equipment')::boolean THEN sqlc.narg('ap_equipment')::integer ELSE current.ap_equipment END AS ap_equipment,
        CASE WHEN sqlc.arg('set_ap_total_score')::boolean THEN sqlc.narg('ap_total_score')::integer ELSE current.ap_total_score END AS ap_total_score,
        CASE WHEN sqlc.arg('set_feasibility_rating')::boolean THEN sqlc.narg('feasibility_rating')::attack_feasibility ELSE current.feasibility_rating END AS feasibility_rating,
        CASE WHEN sqlc.arg('set_rationale')::boolean THEN sqlc.narg('rationale')::text ELSE current.rationale END AS rationale,
        CASE WHEN sqlc.arg('set_rating_method')::boolean THEN sqlc.narg('rating_method')::text ELSE current.rating_method END AS rating_method,
        CASE WHEN sqlc.arg('set_cvss_attack_vector')::boolean THEN sqlc.narg('cvss_attack_vector')::text ELSE current.cvss_attack_vector END AS cvss_attack_vector,
        CASE WHEN sqlc.arg('set_cvss_attack_complexity')::boolean THEN sqlc.narg('cvss_attack_complexity')::text ELSE current.cvss_attack_complexity END AS cvss_attack_complexity,
        CASE WHEN sqlc.arg('set_cvss_privileges_required')::boolean THEN sqlc.narg('cvss_privileges_required')::text ELSE current.cvss_privileges_required END AS cvss_privileges_required,
        CASE WHEN sqlc.arg('set_cvss_user_interaction')::boolean THEN sqlc.narg('cvss_user_interaction')::text ELSE current.cvss_user_interaction END AS cvss_user_interaction,
        CASE WHEN sqlc.arg('set_cvss_scope')::boolean THEN sqlc.narg('cvss_scope')::text ELSE current.cvss_scope END AS cvss_scope,
        CASE WHEN sqlc.arg('set_attack_vector')::boolean THEN sqlc.narg('attack_vector')::text ELSE current.attack_vector END AS attack_vector
    FROM attack_feasibility_rating AS current WHERE current.attack_path_id = sqlc.arg('attack_path_id')
    -- Serialize concurrent patches so each merges against the locked current row.
    FOR UPDATE
), scored AS (
    -- Use the same scoring rules as PUT, now applied to the merged inputs.
    SELECT proposed.*, ap_elapsed_time::bigint + ap_specialist_expertise + ap_knowledge_of_item + ap_window_of_opportunity + ap_equipment AS ap_score,
    8.22
        * CASE cvss_attack_vector WHEN 'NETWORK' THEN 0.85 WHEN 'ADJACENT' THEN 0.62 WHEN 'LOCAL' THEN 0.55 ELSE 0.20 END
        * CASE cvss_attack_complexity WHEN 'LOW' THEN 0.77 ELSE 0.44 END
        * CASE cvss_privileges_required WHEN 'NONE' THEN 0.85
            WHEN 'LOW' THEN CASE WHEN cvss_scope = 'CHANGED' THEN 0.68 ELSE 0.62 END
            ELSE CASE WHEN cvss_scope = 'CHANGED' THEN 0.50 ELSE 0.27 END END
        * CASE cvss_user_interaction WHEN 'NONE' THEN 0.85 ELSE 0.62 END AS cvss_score FROM proposed
)
UPDATE attack_feasibility_rating AS target
SET ap_elapsed_time = scored.ap_elapsed_time,
    ap_specialist_expertise = scored.ap_specialist_expertise,
    ap_knowledge_of_item = scored.ap_knowledge_of_item,
    ap_window_of_opportunity = scored.ap_window_of_opportunity,
    ap_equipment = scored.ap_equipment,
    ap_total_score = scored.ap_total_score,
    feasibility_rating = CASE scored.rating_method
    WHEN 'ATTACK_POTENTIAL' THEN CASE WHEN ap_score IS NULL THEN NULL
        WHEN ap_score <= 13 THEN 'HIGH' WHEN ap_score <= 19 THEN 'MEDIUM'
        WHEN ap_score <= 24 THEN 'LOW' ELSE 'VERY_LOW' END
    WHEN 'CVSS' THEN CASE WHEN cvss_score >= 2.96 THEN 'HIGH'
        WHEN cvss_score >= 2.00 THEN 'MEDIUM' WHEN cvss_score >= 1.06 THEN 'LOW' ELSE 'VERY_LOW' END
    WHEN 'ATTACK_VECTOR' THEN CASE scored.attack_vector WHEN 'NETWORK' THEN 'HIGH'
        WHEN 'ADJACENT' THEN 'MEDIUM' WHEN 'LOCAL' THEN 'LOW' ELSE 'VERY_LOW' END
    END::attack_feasibility,
    rationale = scored.rationale,
    rating_method = scored.rating_method,
    cvss_attack_vector = scored.cvss_attack_vector,
    cvss_attack_complexity = scored.cvss_attack_complexity,
    cvss_privileges_required = scored.cvss_privileges_required,
    cvss_user_interaction = scored.cvss_user_interaction,
    cvss_scope = scored.cvss_scope,
    attack_vector = scored.attack_vector
FROM scored
WHERE target.attack_path_id = scored.attack_path_id
RETURNING target.*;

-- name: DeleteAttackFeasibilityRating :execrows
DELETE FROM attack_feasibility_rating AS current WHERE current.attack_path_id = $1;

-- name: AttackPathBelongsToItem :one
SELECT EXISTS(SELECT 1 FROM attack_path WHERE id = $1 AND item_definition_id = $2) AS belongs;
