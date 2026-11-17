-- Modify "item_definition" table
ALTER TABLE "public"."item_definition" ADD CONSTRAINT "item_definition_project_id_id_key" UNIQUE ("tara_project_id", "id");
-- Modify "attachment" table
ALTER TABLE "public"."attachment" ADD COLUMN "item_definition_id" uuid NULL, ADD CONSTRAINT "attachment_item_definition_fkey" FOREIGN KEY ("project_id", "item_definition_id") REFERENCES "public"."item_definition" ("tara_project_id", "id") ON UPDATE NO ACTION ON DELETE SET NULL;
-- Create index "attachment_item_definition_id_idx" to table: "attachment"
CREATE INDEX "attachment_item_definition_id_idx" ON "public"."attachment" ("project_id", "item_definition_id", "created_at", "id") WHERE (item_definition_id IS NOT NULL);
