-- Extensions for the global search (#240, docs/internal/adr/0005-backend-search.md). Written by hand:
-- Atlas without login rejects CREATE EXTENSION in db/schema.sql and ignores extensions when it compares
-- the migrations with the schema, so this file is the only place that creates them.
-- pg_trgm: typo-tolerant matching with word_similarity (<%). unaccent: "schaden" also finds "Schäden".
-- Both ship with postgres:17-alpine. schema.sql must not use them (no trigram indexes) until the drift
-- check can create them too.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
