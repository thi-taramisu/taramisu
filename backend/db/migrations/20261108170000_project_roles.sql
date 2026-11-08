-- Project roles (#143, #186): Viewer, Editor, Owner, one role per user or group and project.

-- Group membership now comes from the Authentik access token (taramisu_groups claim).
DROP TABLE "public"."iam_user_group_member";

-- PostgreSQL cannot remove or reorder enum values, so the type is recreated in rank order.
-- Existing REVIEWER assignments become VIEWER, the closest role without write access.
ALTER TABLE "public"."project_role_assignment"
  DROP CONSTRAINT "project_role_assignment_tara_project_id_user_id_project_rol_key",
  DROP CONSTRAINT "project_role_assignment_tara_project_id_group_id_project_ro_key";
ALTER TYPE "public"."project_role" RENAME TO "project_role_old";
CREATE TYPE "public"."project_role" AS ENUM ('VIEWER', 'EDITOR', 'OWNER');
ALTER TABLE "public"."project_role_assignment"
  ALTER COLUMN "project_role" TYPE "public"."project_role"
  USING (CASE "project_role"::text WHEN 'REVIEWER' THEN 'VIEWER' ELSE "project_role"::text END)::"public"."project_role";
DROP TYPE "public"."project_role_old";

-- Keep only the highest role per principal before enforcing one role per principal.
DELETE FROM "public"."project_role_assignment" AS lower
USING "public"."project_role_assignment" AS higher
WHERE lower.tara_project_id = higher.tara_project_id
  AND lower.user_id IS NOT DISTINCT FROM higher.user_id
  AND lower.group_id IS NOT DISTINCT FROM higher.group_id
  AND (lower.project_role < higher.project_role
    OR (lower.project_role = higher.project_role AND lower.id < higher.id));

ALTER TABLE "public"."project_role_assignment"
  ADD CONSTRAINT "project_role_assignment_one_user_role" UNIQUE ("tara_project_id", "user_id"),
  ADD CONSTRAINT "project_role_assignment_one_group_role" UNIQUE ("tara_project_id", "group_id");
