-- Modify "tara_project" table
ALTER TABLE "public"."tara_project" ADD COLUMN "deleted_at" timestamptz NULL;
-- Create index "tara_project_deleted_at_idx" to table: "tara_project"
CREATE INDEX "tara_project_deleted_at_idx" ON "public"."tara_project" ("deleted_at") WHERE (deleted_at IS NOT NULL);
-- Modify "item_definition" table
ALTER TABLE "public"."item_definition" DROP CONSTRAINT "item_definition_tara_project_id_fkey", ADD CONSTRAINT "item_definition_tara_project_id_fkey" FOREIGN KEY ("tara_project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
