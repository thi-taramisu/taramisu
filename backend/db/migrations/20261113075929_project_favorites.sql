-- Create "project_favorite" table
CREATE TABLE "public"."project_favorite" (
  "user_id" uuid NOT NULL,
  "tara_project_id" uuid NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("user_id", "tara_project_id"),
  CONSTRAINT "project_favorite_tara_project_id_fkey" FOREIGN KEY ("tara_project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "project_favorite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."iam_user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "project_favorite_tara_project_id_idx" to table: "project_favorite"
CREATE INDEX "project_favorite_tara_project_id_idx" ON "public"."project_favorite" ("tara_project_id");
