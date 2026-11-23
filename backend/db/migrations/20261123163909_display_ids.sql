-- Display IDs (#239). Generated with atlas migrate diff, then edited to backfill existing rows before
-- the columns become NOT NULL. Numbers are assigned per project and element type: items in creation
-- order (created_at), elements, which have no creation time, by their item's number and then by name or title.

-- Create enum type "display_id_type"
CREATE TYPE "public"."display_id_type" AS ENUM ('ITEM', 'ASSET', 'DAMAGE_SCENARIO', 'THREAT_SCENARIO', 'ATTACK_PATH');
-- Create "display_id_counter" table
CREATE TABLE "public"."display_id_counter" (
  "tara_project_id" uuid NOT NULL,
  "element_type" "public"."display_id_type" NOT NULL,
  "last_number" integer NOT NULL,
  PRIMARY KEY ("tara_project_id", "element_type"),
  CONSTRAINT "display_id_counter_tara_project_id_fkey" FOREIGN KEY ("tara_project_id") REFERENCES "public"."tara_project" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "display_id_counter_last_number_check" CHECK (last_number > 0)
);

-- Add the columns without NOT NULL first
ALTER TABLE "public"."item_definition" ADD COLUMN "display_number" integer;
ALTER TABLE "public"."asset" ADD COLUMN "tara_project_id" uuid, ADD COLUMN "display_number" integer;
ALTER TABLE "public"."damage_scenario" ADD COLUMN "tara_project_id" uuid, ADD COLUMN "display_number" integer;
ALTER TABLE "public"."threat_scenario" ADD COLUMN "tara_project_id" uuid, ADD COLUMN "display_number" integer;
ALTER TABLE "public"."attack_path" ADD COLUMN "tara_project_id" uuid, ADD COLUMN "display_number" integer;

-- Backfill the item numbers
UPDATE "public"."item_definition" AS i SET "display_number" = n.number
FROM (
  SELECT id, row_number() OVER (PARTITION BY tara_project_id ORDER BY created_at, id) AS number
  FROM "public"."item_definition"
) AS n
WHERE i.id = n.id;

-- Backfill the elements' project and numbers
UPDATE "public"."asset" AS e SET "tara_project_id" = n.tara_project_id, "display_number" = n.number
FROM (
  SELECT e.id, i.tara_project_id,
    row_number() OVER (PARTITION BY i.tara_project_id ORDER BY i.display_number, e.name, e.id) AS number
  FROM "public"."asset" AS e JOIN "public"."item_definition" AS i ON i.id = e.item_definition_id
) AS n
WHERE e.id = n.id;
UPDATE "public"."damage_scenario" AS e SET "tara_project_id" = n.tara_project_id, "display_number" = n.number
FROM (
  SELECT e.id, i.tara_project_id,
    row_number() OVER (PARTITION BY i.tara_project_id ORDER BY i.display_number, e.title, e.id) AS number
  FROM "public"."damage_scenario" AS e JOIN "public"."item_definition" AS i ON i.id = e.item_definition_id
) AS n
WHERE e.id = n.id;
UPDATE "public"."threat_scenario" AS e SET "tara_project_id" = n.tara_project_id, "display_number" = n.number
FROM (
  SELECT e.id, i.tara_project_id,
    row_number() OVER (PARTITION BY i.tara_project_id ORDER BY i.display_number, e.title, e.id) AS number
  FROM "public"."threat_scenario" AS e JOIN "public"."item_definition" AS i ON i.id = e.item_definition_id
) AS n
WHERE e.id = n.id;
UPDATE "public"."attack_path" AS e SET "tara_project_id" = n.tara_project_id, "display_number" = n.number
FROM (
  SELECT e.id, i.tara_project_id,
    row_number() OVER (PARTITION BY i.tara_project_id ORDER BY i.display_number, e.title, e.id) AS number
  FROM "public"."attack_path" AS e JOIN "public"."item_definition" AS i ON i.id = e.item_definition_id
) AS n
WHERE e.id = n.id;

-- Continue counting after the backfilled numbers
INSERT INTO "public"."display_id_counter" ("tara_project_id", "element_type", "last_number")
SELECT tara_project_id, 'ITEM'::"public"."display_id_type", max(display_number) FROM "public"."item_definition" GROUP BY tara_project_id
UNION ALL
SELECT tara_project_id, 'ASSET'::"public"."display_id_type", max(display_number) FROM "public"."asset" GROUP BY tara_project_id
UNION ALL
SELECT tara_project_id, 'DAMAGE_SCENARIO'::"public"."display_id_type", max(display_number) FROM "public"."damage_scenario" GROUP BY tara_project_id
UNION ALL
SELECT tara_project_id, 'THREAT_SCENARIO'::"public"."display_id_type", max(display_number) FROM "public"."threat_scenario" GROUP BY tara_project_id
UNION ALL
SELECT tara_project_id, 'ATTACK_PATH'::"public"."display_id_type", max(display_number) FROM "public"."attack_path" GROUP BY tara_project_id;

-- Modify "item_definition" table
ALTER TABLE "public"."item_definition" ALTER COLUMN "display_number" SET NOT NULL, ADD CONSTRAINT "item_definition_display_number_check" CHECK (display_number > 0), ADD CONSTRAINT "item_definition_display_number_key" UNIQUE ("tara_project_id", "display_number"), ADD CONSTRAINT "item_definition_id_project_key" UNIQUE ("id", "tara_project_id");
-- Drop index "item_definition_tara_project_id_idx" from table: "item_definition", replaced by the index of "item_definition_display_number_key"
DROP INDEX "public"."item_definition_tara_project_id_idx";
-- Modify "asset" table
ALTER TABLE "public"."asset" DROP CONSTRAINT "asset_item_definition_id_fkey", ALTER COLUMN "tara_project_id" SET NOT NULL, ALTER COLUMN "display_number" SET NOT NULL, ADD CONSTRAINT "asset_display_number_check" CHECK (display_number > 0), ADD CONSTRAINT "asset_display_number_key" UNIQUE ("tara_project_id", "display_number"), ADD CONSTRAINT "asset_item_definition_fk" FOREIGN KEY ("item_definition_id", "tara_project_id") REFERENCES "public"."item_definition" ("id", "tara_project_id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "attack_path" table
ALTER TABLE "public"."attack_path" DROP CONSTRAINT "attack_path_item_definition_id_fkey", ALTER COLUMN "tara_project_id" SET NOT NULL, ALTER COLUMN "display_number" SET NOT NULL, ADD CONSTRAINT "attack_path_display_number_check" CHECK (display_number > 0), ADD CONSTRAINT "attack_path_display_number_key" UNIQUE ("tara_project_id", "display_number"), ADD CONSTRAINT "attack_path_item_definition_fk" FOREIGN KEY ("item_definition_id", "tara_project_id") REFERENCES "public"."item_definition" ("id", "tara_project_id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "damage_scenario" table
ALTER TABLE "public"."damage_scenario" DROP CONSTRAINT "damage_scenario_item_definition_id_fkey", ALTER COLUMN "tara_project_id" SET NOT NULL, ALTER COLUMN "display_number" SET NOT NULL, ADD CONSTRAINT "damage_scenario_display_number_check" CHECK (display_number > 0), ADD CONSTRAINT "damage_scenario_display_number_key" UNIQUE ("tara_project_id", "display_number"), ADD CONSTRAINT "damage_scenario_item_definition_fk" FOREIGN KEY ("item_definition_id", "tara_project_id") REFERENCES "public"."item_definition" ("id", "tara_project_id") ON UPDATE NO ACTION ON DELETE CASCADE;
-- Modify "threat_scenario" table
ALTER TABLE "public"."threat_scenario" DROP CONSTRAINT "threat_scenario_item_definition_id_fkey", ALTER COLUMN "tara_project_id" SET NOT NULL, ALTER COLUMN "display_number" SET NOT NULL, ADD CONSTRAINT "threat_scenario_display_number_check" CHECK (display_number > 0), ADD CONSTRAINT "threat_scenario_display_number_key" UNIQUE ("tara_project_id", "display_number"), ADD CONSTRAINT "threat_scenario_item_definition_fk" FOREIGN KEY ("item_definition_id", "tara_project_id") REFERENCES "public"."item_definition" ("id", "tara_project_id") ON UPDATE NO ACTION ON DELETE CASCADE;
