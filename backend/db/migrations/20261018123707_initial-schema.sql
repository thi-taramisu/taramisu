-- Create enum type "project_role"
CREATE TYPE "public"."project_role" AS ENUM ('OWNER', 'EDITOR', 'REVIEWER', 'VIEWER');
-- Create enum type "scope_type"
CREATE TYPE "public"."scope_type" AS ENUM ('ITEM', 'COMPONENT');
-- Create enum type "identification_source"
CREATE TYPE "public"."identification_source" AS ENUM ('ITEM_DEF', 'IMPACT_RATING', 'THREAT_DERIVED', 'CATALOGUE');
-- Create enum type "cybersecurity_property_type"
CREATE TYPE "public"."cybersecurity_property_type" AS ENUM ('CONFIDENTIALITY', 'INTEGRITY', 'AVAILABILITY');
-- Create enum type "impact_category"
CREATE TYPE "public"."impact_category" AS ENUM ('SAFETY', 'FINANCIAL', 'OPERATIONAL', 'PRIVACY');
-- Create enum type "impact_rating_value"
CREATE TYPE "public"."impact_rating_value" AS ENUM ('SEVERE', 'MAJOR', 'MODERATE', 'NEGLIGIBLE', 'OMITTED');
-- Create enum type "elicitation_method"
CREATE TYPE "public"."elicitation_method" AS ENUM ('GROUP_DISCUSSION', 'MALICIOUS_USE_CASE', 'EVITA', 'TVRA', 'PASTA', 'STRIDE', 'OTHER');
-- Create enum type "attack_feasibility"
CREATE TYPE "public"."attack_feasibility" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'VERY_LOW');
-- Create enum type "analysis_approach"
CREATE TYPE "public"."analysis_approach" AS ENUM ('TOP_DOWN', 'BOTTOM_UP');
-- Create enum type "risk_determination_method"
CREATE TYPE "public"."risk_determination_method" AS ENUM ('RISK_MATRIX', 'RISK_FORMULA');
-- Create enum type "risk_treatment_option"
CREATE TYPE "public"."risk_treatment_option" AS ENUM ('AVOIDING', 'REDUCING', 'SHARING', 'RETAINING');
-- Create "tara_project" table
CREATE TABLE "public"."tara_project" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "description" text NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id")
);
-- Create "item_definition" table
CREATE TABLE "public"."item_definition" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tara_project_id" uuid NOT NULL,
  "name" text NOT NULL,
  "scope_type" "public"."scope_type" NOT NULL,
  "lifecycle_phase" text NULL,
  "item_definition_wp_09_01" text NULL,
  "cybersecurity_specs_wp_10_01" text NULL,
  "architectural_design" text NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "item_definition_tara_project_id_fkey" FOREIGN KEY ("tara_project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "item_definition_tara_project_id_idx" to table: "item_definition"
CREATE INDEX "item_definition_tara_project_id_idx" ON "public"."item_definition" ("tara_project_id");
-- Create "asset" table
CREATE TABLE "public"."asset" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "item_definition_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text NULL,
  "identification_source" "public"."identification_source" NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "asset_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "asset_item_definition_id_idx" to table: "asset"
CREATE INDEX "asset_item_definition_id_idx" ON "public"."asset" ("item_definition_id");
-- Create "asset_cybersecurity_property" table
CREATE TABLE "public"."asset_cybersecurity_property" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "asset_id" uuid NOT NULL,
  "property_type" "public"."cybersecurity_property_type" NOT NULL,
  "description" text NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "asset_cybersecurity_property_asset_id_property_type_key" UNIQUE ("asset_id", "property_type"),
  CONSTRAINT "asset_cybersecurity_property_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."asset" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create "attack_path" table
CREATE TABLE "public"."attack_path" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "item_definition_id" uuid NOT NULL,
  "title" text NOT NULL,
  "analysis_approach" "public"."analysis_approach" NULL,
  "is_partial_early_stage" boolean NOT NULL DEFAULT true,
  "attack_steps_and_weaknesses" jsonb NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "attack_path_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "attack_path_item_definition_id_idx" to table: "attack_path"
CREATE INDEX "attack_path_item_definition_id_idx" ON "public"."attack_path" ("item_definition_id");
-- Create "attack_feasibility_rating" table
CREATE TABLE "public"."attack_feasibility_rating" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "attack_path_id" uuid NOT NULL,
  "ap_elapsed_time" integer NULL,
  "ap_specialist_expertise" integer NULL,
  "ap_knowledge_of_item" integer NULL,
  "ap_window_of_opportunity" integer NULL,
  "ap_equipment" integer NULL,
  "ap_total_score" integer NULL,
  "feasibility_rating" "public"."attack_feasibility" NULL,
  "rationale" text NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "attack_feasibility_rating_attack_path_id_key" UNIQUE ("attack_path_id"),
  CONSTRAINT "attack_feasibility_rating_attack_path_id_fkey" FOREIGN KEY ("attack_path_id") REFERENCES "public"."attack_path" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "attack_feasibility_rating_ap_elapsed_time_check" CHECK (ap_elapsed_time >= 0),
  CONSTRAINT "attack_feasibility_rating_ap_equipment_check" CHECK (ap_equipment >= 0),
  CONSTRAINT "attack_feasibility_rating_ap_knowledge_of_item_check" CHECK (ap_knowledge_of_item >= 0),
  CONSTRAINT "attack_feasibility_rating_ap_specialist_expertise_check" CHECK (ap_specialist_expertise >= 0),
  CONSTRAINT "attack_feasibility_rating_ap_total_score_check" CHECK (ap_total_score >= 0),
  CONSTRAINT "attack_feasibility_rating_ap_window_of_opportunity_check" CHECK (ap_window_of_opportunity >= 0),
  CONSTRAINT "attack_feasibility_rating_total_consistent" CHECK ((ap_total_score IS NULL) OR ((ap_elapsed_time IS NOT NULL) AND (ap_specialist_expertise IS NOT NULL) AND (ap_knowledge_of_item IS NOT NULL) AND (ap_window_of_opportunity IS NOT NULL) AND (ap_equipment IS NOT NULL) AND (ap_total_score = ((((ap_elapsed_time + ap_specialist_expertise) + ap_knowledge_of_item) + ap_window_of_opportunity) + ap_equipment))))
);
-- Create "damage_scenario" table
CREATE TABLE "public"."damage_scenario" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "item_definition_id" uuid NOT NULL,
  "title" text NOT NULL,
  "functionality_adverse_relation" text NULL,
  "road_user_harm_description" text NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "damage_scenario_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION
);
-- Create index "damage_scenario_item_definition_id_idx" to table: "damage_scenario"
CREATE INDEX "damage_scenario_item_definition_id_idx" ON "public"."damage_scenario" ("item_definition_id");
-- Create "damage_scenario_asset_property" table
CREATE TABLE "public"."damage_scenario_asset_property" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "damage_scenario_id" uuid NOT NULL,
  "asset_cybersecurity_property_id" uuid NOT NULL,
  "compromise_mechanism_note" text NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "damage_scenario_asset_propert_damage_scenario_id_asset_cybe_key" UNIQUE ("damage_scenario_id", "asset_cybersecurity_property_id"),
  CONSTRAINT "damage_scenario_asset_propert_asset_cybersecurity_property_fkey" FOREIGN KEY ("asset_cybersecurity_property_id") REFERENCES "public"."asset_cybersecurity_property" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "damage_scenario_asset_property_damage_scenario_id_fkey" FOREIGN KEY ("damage_scenario_id") REFERENCES "public"."damage_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "damage_scenario_asset_property_property_id_idx" to table: "damage_scenario_asset_property"
CREATE INDEX "damage_scenario_asset_property_property_id_idx" ON "public"."damage_scenario_asset_property" ("asset_cybersecurity_property_id");
-- Create "iam_group" table
CREATE TABLE "public"."iam_group" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "external_iam_group_id" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "iam_group_external_iam_group_id_key" UNIQUE ("external_iam_group_id")
);
-- Create "iam_user" table
CREATE TABLE "public"."iam_user" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "external_iam_sub" text NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "iam_user_external_iam_sub_key" UNIQUE ("external_iam_sub")
);
-- Create "iam_user_group_member" table
CREATE TABLE "public"."iam_user_group_member" (
  "user_id" uuid NOT NULL,
  "group_id" uuid NOT NULL,
  PRIMARY KEY ("user_id", "group_id"),
  CONSTRAINT "iam_user_group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."iam_group" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "iam_user_group_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."iam_user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "iam_user_group_member_group_id_idx" to table: "iam_user_group_member"
CREATE INDEX "iam_user_group_member_group_id_idx" ON "public"."iam_user_group_member" ("group_id");
-- Create "impact_rating" table
CREATE TABLE "public"."impact_rating" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "damage_scenario_id" uuid NOT NULL,
  "impact_category" "public"."impact_category" NOT NULL,
  "rating_value" "public"."impact_rating_value" NULL,
  "is_omitted_by_pm_15_07" boolean NOT NULL DEFAULT false,
  "omission_or_rating_rationale" text NULL,
  "reused_from_functional_safety" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("id"),
  CONSTRAINT "impact_rating_damage_scenario_id_impact_category_key" UNIQUE ("damage_scenario_id", "impact_category"),
  CONSTRAINT "impact_rating_damage_scenario_id_fkey" FOREIGN KEY ("damage_scenario_id") REFERENCES "public"."damage_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "impact_rating_functional_safety_category" CHECK ((NOT reused_from_functional_safety) OR (impact_category = 'SAFETY'::public.impact_category)),
  CONSTRAINT "impact_rating_omission_consistent" CHECK (is_omitted_by_pm_15_07 = ((rating_value IS NOT NULL) AND (rating_value = 'OMITTED'::public.impact_rating_value)))
);
-- Create "project_role_assignment" table
CREATE TABLE "public"."project_role_assignment" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "tara_project_id" uuid NOT NULL,
  "user_id" uuid NULL,
  "group_id" uuid NULL,
  "project_role" "public"."project_role" NOT NULL,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("id"),
  CONSTRAINT "project_role_assignment_tara_project_id_group_id_project_ro_key" UNIQUE ("tara_project_id", "group_id", "project_role"),
  CONSTRAINT "project_role_assignment_tara_project_id_user_id_project_rol_key" UNIQUE ("tara_project_id", "user_id", "project_role"),
  CONSTRAINT "project_role_assignment_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "public"."iam_group" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "project_role_assignment_tara_project_id_fkey" FOREIGN KEY ("tara_project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "project_role_assignment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."iam_user" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "project_role_assignment_one_principal" CHECK ((user_id IS NOT NULL) <> (group_id IS NOT NULL))
);
-- Create index "project_role_assignment_group_id_idx" to table: "project_role_assignment"
CREATE INDEX "project_role_assignment_group_id_idx" ON "public"."project_role_assignment" ("group_id");
-- Create index "project_role_assignment_user_id_idx" to table: "project_role_assignment"
CREATE INDEX "project_role_assignment_user_id_idx" ON "public"."project_role_assignment" ("user_id");
-- Create "threat_scenario" table
CREATE TABLE "public"."threat_scenario" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "item_definition_id" uuid NOT NULL,
  "title" text NOT NULL,
  "cause_of_compromise" text NULL,
  "elicitation_method" "public"."elicitation_method" NULL,
  "technical_notes" text NULL,
  "aggregated_attack_feasibility" "public"."attack_feasibility" NULL,
  "max_risk_score" integer NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "threat_scenario_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "threat_scenario_max_risk_score_check" CHECK ((max_risk_score >= 1) AND (max_risk_score <= 5))
);
-- Create index "threat_scenario_item_definition_id_idx" to table: "threat_scenario"
CREATE INDEX "threat_scenario_item_definition_id_idx" ON "public"."threat_scenario" ("item_definition_id");
-- Create "risk_value" table
CREATE TABLE "public"."risk_value" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threat_scenario_id" uuid NOT NULL,
  "impact_rating_id" uuid NOT NULL,
  "risk_score" integer NOT NULL,
  "determination_method" "public"."risk_determination_method" NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "risk_value_id_threat_scenario_id_key" UNIQUE ("id", "threat_scenario_id"),
  CONSTRAINT "risk_value_threat_scenario_id_impact_rating_id_key" UNIQUE ("threat_scenario_id", "impact_rating_id"),
  CONSTRAINT "risk_value_impact_rating_id_fkey" FOREIGN KEY ("impact_rating_id") REFERENCES "public"."impact_rating" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "risk_value_threat_scenario_id_fkey" FOREIGN KEY ("threat_scenario_id") REFERENCES "public"."threat_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "risk_value_risk_score_check" CHECK ((risk_score >= 1) AND (risk_score <= 5))
);
-- Create index "risk_value_impact_rating_id_idx" to table: "risk_value"
CREATE INDEX "risk_value_impact_rating_id_idx" ON "public"."risk_value" ("impact_rating_id");
-- Create "risk_treatment_decision" table
CREATE TABLE "public"."risk_treatment_decision" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threat_scenario_id" uuid NOT NULL,
  "risk_value_id" uuid NULL,
  "treatment_option" "public"."risk_treatment_option" NOT NULL,
  "decision_rationale" text NULL,
  "is_cybersecurity_claim" boolean NOT NULL DEFAULT false,
  PRIMARY KEY ("id"),
  CONSTRAINT "risk_treatment_decision_risk_threat_fk" FOREIGN KEY ("risk_value_id", "threat_scenario_id") REFERENCES "public"."risk_value" ("id", "threat_scenario_id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "risk_treatment_decision_threat_scenario_id_fkey" FOREIGN KEY ("threat_scenario_id") REFERENCES "public"."threat_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "risk_treatment_decision_claim_required" CHECK ((treatment_option <> ALL (ARRAY['RETAINING'::public.risk_treatment_option, 'SHARING'::public.risk_treatment_option])) OR is_cybersecurity_claim)
);
-- Create index "risk_treatment_decision_risk_value_id_idx" to table: "risk_treatment_decision"
CREATE INDEX "risk_treatment_decision_risk_value_id_idx" ON "public"."risk_treatment_decision" ("risk_value_id", "threat_scenario_id");
-- Create index "risk_treatment_decision_threat_scenario_id_idx" to table: "risk_treatment_decision"
CREATE INDEX "risk_treatment_decision_threat_scenario_id_idx" ON "public"."risk_treatment_decision" ("threat_scenario_id");
-- Create "threat_attack_path_link" table
CREATE TABLE "public"."threat_attack_path_link" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threat_scenario_id" uuid NOT NULL,
  "attack_path_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "threat_attack_path_link_threat_scenario_id_attack_path_id_key" UNIQUE ("threat_scenario_id", "attack_path_id"),
  CONSTRAINT "threat_attack_path_link_attack_path_id_fkey" FOREIGN KEY ("attack_path_id") REFERENCES "public"."attack_path" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "threat_attack_path_link_threat_scenario_id_fkey" FOREIGN KEY ("threat_scenario_id") REFERENCES "public"."threat_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "threat_attack_path_link_attack_path_id_idx" to table: "threat_attack_path_link"
CREATE INDEX "threat_attack_path_link_attack_path_id_idx" ON "public"."threat_attack_path_link" ("attack_path_id");
-- Create "threat_damage_link" table
CREATE TABLE "public"."threat_damage_link" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threat_scenario_id" uuid NOT NULL,
  "damage_scenario_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "threat_damage_link_threat_scenario_id_damage_scenario_id_key" UNIQUE ("threat_scenario_id", "damage_scenario_id"),
  CONSTRAINT "threat_damage_link_damage_scenario_id_fkey" FOREIGN KEY ("damage_scenario_id") REFERENCES "public"."damage_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "threat_damage_link_threat_scenario_id_fkey" FOREIGN KEY ("threat_scenario_id") REFERENCES "public"."threat_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "threat_damage_link_damage_scenario_id_idx" to table: "threat_damage_link"
CREATE INDEX "threat_damage_link_damage_scenario_id_idx" ON "public"."threat_damage_link" ("damage_scenario_id");
-- Create "threat_scenario_asset_property" table
CREATE TABLE "public"."threat_scenario_asset_property" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "threat_scenario_id" uuid NOT NULL,
  "asset_cybersecurity_property_id" uuid NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "threat_scenario_asset_propert_threat_scenario_id_asset_cybe_key" UNIQUE ("threat_scenario_id", "asset_cybersecurity_property_id"),
  CONSTRAINT "threat_scenario_asset_propert_asset_cybersecurity_property_fkey" FOREIGN KEY ("asset_cybersecurity_property_id") REFERENCES "public"."asset_cybersecurity_property" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "threat_scenario_asset_property_threat_scenario_id_fkey" FOREIGN KEY ("threat_scenario_id") REFERENCES "public"."threat_scenario" ("id") ON UPDATE NO ACTION ON DELETE CASCADE
);
-- Create index "threat_scenario_asset_property_property_id_idx" to table: "threat_scenario_asset_property"
CREATE INDEX "threat_scenario_asset_property_property_id_idx" ON "public"."threat_scenario_asset_property" ("asset_cybersecurity_property_id");
