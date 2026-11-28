-- Drop index "attachment_pending_deletion_idx" from table: "attachment"
DROP INDEX "public"."attachment_pending_deletion_idx";
-- Modify "attachment" table
ALTER TABLE "public"."attachment" DROP CONSTRAINT "attachment_project_id_fkey", ALTER COLUMN "project_id" DROP NOT NULL, ADD CONSTRAINT "attachment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE SET NULL;
-- Create index "attachment_pending_deletion_idx" to table: "attachment"
CREATE INDEX "attachment_pending_deletion_idx" ON "public"."attachment" ("id") WHERE (delete_pending OR (project_id IS NULL));
