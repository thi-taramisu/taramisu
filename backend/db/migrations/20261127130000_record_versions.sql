-- Modify "asset" table
ALTER TABLE "public"."asset" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "asset_cybersecurity_property" table
ALTER TABLE "public"."asset_cybersecurity_property" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "attack_feasibility_rating" table
ALTER TABLE "public"."attack_feasibility_rating" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "attack_path" table
ALTER TABLE "public"."attack_path" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "damage_scenario" table
ALTER TABLE "public"."damage_scenario" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "damage_scenario_asset_property" table
ALTER TABLE "public"."damage_scenario_asset_property" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "impact_rating" table
ALTER TABLE "public"."impact_rating" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "item_definition" table
ALTER TABLE "public"."item_definition" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "project_role_assignment" table
ALTER TABLE "public"."project_role_assignment" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "risk_treatment_decision" table
ALTER TABLE "public"."risk_treatment_decision" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "risk_value" table
ALTER TABLE "public"."risk_value" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "tara_project" table
ALTER TABLE "public"."tara_project" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "threat_scenario" table
ALTER TABLE "public"."threat_scenario" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
-- Modify "threat_scenario_asset_property" table
ALTER TABLE "public"."threat_scenario_asset_property" ADD COLUMN "version" integer NOT NULL DEFAULT 1;
