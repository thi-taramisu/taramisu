-- Create "service_status" table
CREATE TABLE "public"."service_status" (
  "id" boolean NOT NULL DEFAULT true,
  "message" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "service_status_id_check" CHECK (id)
);
