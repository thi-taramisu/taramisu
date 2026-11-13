-- Create "audit_event" table
CREATE TABLE "public"."audit_event" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "occurred_at" timestamptz NOT NULL DEFAULT clock_timestamp(),
  "tara_project_id" uuid NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "event" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "before" jsonb NULL,
  "after" jsonb NULL,
  "request_id" text NULL,
  PRIMARY KEY ("id")
);
-- Create index "audit_event_project_deleted_idx" to table: "audit_event"
CREATE INDEX "audit_event_project_deleted_idx" ON "public"."audit_event" ("occurred_at") WHERE (event = 'project.deleted'::text);
-- Create index "audit_event_project_time_idx" to table: "audit_event"
CREATE INDEX "audit_event_project_time_idx" ON "public"."audit_event" ("tara_project_id", "occurred_at" DESC);
