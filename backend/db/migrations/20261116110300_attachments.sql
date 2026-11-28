-- Create "attachment" table
CREATE TABLE "public"."attachment" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" bigint NOT NULL,
  "sha256" text NOT NULL,
  "s3_object_key" uuid NOT NULL,
  "uploaded_by" uuid NOT NULL,
  "delete_pending" boolean NOT NULL DEFAULT false,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "attachment_s3_object_key_key" UNIQUE ("s3_object_key"),
  CONSTRAINT "attachment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "attachment_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."iam_user" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "attachment_file_name_check" CHECK ((length(file_name) >= 1) AND (length(file_name) <= 255)),
  CONSTRAINT "attachment_sha256_check" CHECK (sha256 ~ '^[0-9a-f]{64}$'::text),
  CONSTRAINT "attachment_size_bytes_check" CHECK ((size_bytes > 0) AND (size_bytes <= 10485760))
);
-- Create index "attachment_pending_deletion_idx" to table: "attachment"
CREATE INDEX "attachment_pending_deletion_idx" ON "public"."attachment" ("id") WHERE delete_pending;
-- Create index "attachment_project_id_created_at_id_idx" to table: "attachment"
CREATE INDEX "attachment_project_id_created_at_id_idx" ON "public"."attachment" ("project_id", "created_at", "id");
