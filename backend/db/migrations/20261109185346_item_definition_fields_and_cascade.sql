-- Modify "item_definition" table
ALTER TABLE "public"."item_definition" ADD COLUMN "boundary" text NULL, ADD COLUMN "functions" text NULL, ADD COLUMN "operational_environment" text NULL;
-- Modify "asset" table
ALTER TABLE "public"."asset" DROP CONSTRAINT "asset_item_definition_id_fkey", ADD CONSTRAINT "asset_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "attack_path" table
ALTER TABLE "public"."attack_path" DROP CONSTRAINT "attack_path_item_definition_id_fkey", ADD CONSTRAINT "attack_path_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "damage_scenario" table
ALTER TABLE "public"."damage_scenario" DROP CONSTRAINT "damage_scenario_item_definition_id_fkey", ADD CONSTRAINT "damage_scenario_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "threat_scenario" table
ALTER TABLE "public"."threat_scenario" DROP CONSTRAINT "threat_scenario_item_definition_id_fkey", ADD CONSTRAINT "threat_scenario_item_definition_id_fkey" FOREIGN KEY ("item_definition_id") REFERENCES "public"."item_definition" ("id") ON UPDATE NO ACTION ON DELETE CASCADE;
