-- Modify "attack_path" table
ALTER TABLE "public"."attack_path" ADD CONSTRAINT "attack_path_initial_rating_method_check" CHECK (initial_rating_method = ANY (ARRAY['ATTACK_POTENTIAL'::text, 'CVSS'::text, 'ATTACK_VECTOR'::text])), ADD COLUMN "initial_rating_method" text NOT NULL DEFAULT 'ATTACK_POTENTIAL';
-- Modify "tara_project" table
ALTER TABLE "public"."tara_project" ADD CONSTRAINT "tara_project_default_rating_method_check" CHECK (default_rating_method = ANY (ARRAY['ATTACK_POTENTIAL'::text, 'CVSS'::text, 'ATTACK_VECTOR'::text])), ADD COLUMN "default_rating_method" text NULL;
-- Preserve the selected method of already rated paths as their initial method.
-- Unrated paths retain ATTACK_POTENTIAL; rating rows and results are untouched.
UPDATE attack_path AS p
SET initial_rating_method = r.rating_method
FROM attack_feasibility_rating AS r
WHERE r.attack_path_id = p.id;
