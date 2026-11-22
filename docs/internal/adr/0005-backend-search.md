# ADR 0005: Backend search

- Status: Proposed
- Issue: [#317](https://github.com/thi-taramisu/taramisu/issues/317)
- Related: #240 (backend search), #193 (frontend search), #239 (display IDs)

## Context

Users search elements by name and display ID in the projects they can access (#193, #240), and the search should tolerate small typos.
Options: plain `ILIKE`, PostgreSQL `pg_trgm`, or embeddings.

## Decision

Use **`pg_trgm`** in the existing PostgreSQL. Match with `ILIKE` and `word_similarity` (`<%`), so a word is also found
inside a longer title. The access filter (role directly or through a group, later also `deleted_at IS NULL`) stays in the search
query and applies before pagination. GIN trigram indexes are added when the search gets slow; the extension alone gives the typo tolerance.

Embeddings (`pgvector`) are not used: the base image `postgres:17-alpine` does not include `pgvector`, we would have to create
the embeddings ourselves (the LLM service only forwards chat completions, #298), and for searching by name and ID they have no
advantage over `pg_trgm` with the current requirements.

## Consequences

- `pg_trgm` is part of `postgres:17-alpine`, but Atlas Community does not allow `CREATE EXTENSION` in `schema.sql`: add a
  hand-written migration and install the extension in the dev and CI databases used for the drift check.
- Small typos are found, bigger ones may not. Scores of `word_similarity` with the default threshold 0.6 (a few examples
  measured on `postgres:17-alpine`, not a benchmark):

  | Typed | Title | Score | Found |
  | --- | --- | --- | --- |
  | `spofed` | Spoofed camera frames | 0.67 | yes |
  | `headlmp` | Headlamp glares oncoming traffic | 0.63 | yes |
  | `TS-1` | TS-01 | 0.60 | yes |
  | `camra` | Spoofed camera frames | 0.50 | no |
  | `schaden` | Schäden am Fahrzeug | 0.45 | no |
  | `schaeden` | Schäden am Fahrzeug | 0.42 | no |

  The threshold can be lowered (`pg_trgm.word_similarity_threshold`) at the cost of more false matches. `unaccent` could help
  with umlauts later.
- Search texts under 3 characters cannot use a trigram index.
