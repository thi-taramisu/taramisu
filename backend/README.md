# Taramisu backend

Go HTTP API for Taramisu.

- **[Chi](https://github.com/go-chi/chi)** — routing
- **[Huma](https://huma.rocks)** — handlers, OpenAPI 3.1, Swagger UI at `/docs`
- **PostgreSQL** + **pgx** — database
- **sqlc** — queries in `db/queries/` → `internal/db/`
- **Atlas** — migrations from `db/schema.sql` in `db/migrations/`
- **Docker Compose** — Postgres, migrate, optional API container, optional pgAdmin

## Prerequisites

- Docker (Compose), Go 1.25+, make
- [Atlas](https://atlasgo.io/getting-started#installation) v1.3.0 — optional locally (Compose runs `arigaio/atlas:1.3.0`)
- [sqlc](https://docs.sqlc.dev/en/latest/overview/install.html) v1.31.1 — to regenerate or verify `internal/db/` after
  changing `db/queries/` or `db/schema.sql`

## Commands

```bash
cp .env.example .env
make db migrate
make pgadmin
make run
make up
make down
make reset
make test
make openapi
make migrate-diff name=my_change
make migrate-validate
make sqlc
make sqlc-diff
make lint
make fmt
```

Copy `.env.example` once; the Makefile loads `.env` for `make run` and `make test`. `make down` stops Compose but keeps Postgres data.

`make pgadmin` starts [pgAdmin](https://www.pgadmin.org/) at [http://localhost:5050](http://localhost:5050) (no login) with the
Compose database pre-registered and connected. It is opt-in (`tools` profile), so `make up` does not start it; `make down` stops it.

> **Warning:** `make reset` runs `docker compose down -v` and **deletes the local Postgres volume** (all data in the
> Compose `postgres_data` volume). Use it when you want a clean database, not for a normal stop.

## Database migrations and sqlc drift detection

After editing `db/schema.sql` or `db/queries/`, generate the corresponding Atlas migration and refresh the `sqlc` models:

```bash
make migrate-diff name=my_change
make sqlc
```

CI verifies that migrations and generated Go models are in sync with `db/schema.sql` and `db/queries/`:

1. **Migration directory integrity (`atlas.sum`):**

   ```bash
   make migrate-validate
   # or directly with Atlas CLI:
   atlas migrate validate --dir file://db/migrations
   ```

2. **No pending schema drift between `db/migrations/` and `db/schema.sql`:**

   ```bash
   make migrate-diff name=drift_check
   git status --porcelain -- db/migrations
   # or directly with Atlas CLI against an empty dev database:
   atlas migrate diff drift_check \
     --dir file://db/migrations \
     --to file://db/schema.sql \
     --dev-url "$TEST_DATABASE_URL"
   test -z "$(git status --porcelain -- db/migrations)"
   ```

3. **`sqlc` generated code in `internal/db/` is up to date:**

   ```bash
   make sqlc-diff
   # or directly:
   sqlc diff
   ```

## Tests and coverage

Run unit tests with `make test`. Without `TEST_DATABASE_URL`, `TestPostgresReadiness` skips;
with it set, the test connects to PostgreSQL and checks `/health/ready` against the migrated database.

For local integration testing, start and migrate the Compose database, then run (Bash):

```bash
make db migrate
export TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu?sslmode=disable'
go test -race -v ./...
```

This uses the local development database. To use a separate test database, create it first, then apply
the committed migrations with Atlas 1.3.0 and use the same URL for the tests:

```bash
export TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu_test?sslmode=disable'
atlas migrate apply --dir file://db/migrations --url "$TEST_DATABASE_URL"
go test -race -v ./...
```

From `backend/`, generate and inspect statement coverage:

```bash
go test -coverprofile=coverage.out ./...
go tool cover -func=coverage.out
go tool cover -html=coverage.out
# Same test and coverage gate as CI (Python 3 required):
go test -race -v -covermode=atomic -coverprofile=coverage.out ./...
python3 scripts/check_coverage.py coverage.out
```

CI starts a dedicated `postgres:17-alpine` service with a fresh `taramisu_test` database, waits for
readiness, validates Atlas migration integrity and schema drift, checks `sqlc` code freshness, and applies
Atlas migrations before testing. `TEST_DATABASE_URL` enables the integration test.
The coverage checker enforces at least **80% statement coverage per package** under `internal/httpapi/...`
and future `internal/service/...`, using exact statement counts. CLI entrypoints (`cmd/`) and
`internal/db/` (including sqlc-generated `models.go` and `*.sql.go`) are excluded from the gate.
It prints a Markdown table and appends it to the GitHub Actions step summary, including when the gate
fails. Missing or empty domain coverage fails the check. The raw profile still contains all tested packages.

## Structure

```text
cmd/api/                       entrypoint
cmd/openapi/                   offline OpenAPI JSON export (stdout)
db/                            schema, Atlas migrations, sqlc queries
internal/db/                   sqlc-generated query code
internal/httpapi/              router, OpenAPI
internal/httpapi/handlers/     HTTP handlers
```

So far the API only has health checks: `GET /health/live` and `GET /health/ready` (readiness uses Postgres after
migrate). No domain routes yet.

## OpenAPI contract

With the API running (default `:8080`, overridable via `HTTP_ADDR`): OpenAPI 3.1 at
[http://localhost:8080/openapi.json](http://localhost:8080/openapi.json), UI at [/docs](http://localhost:8080/docs).
Example: `curl -fsS "http://localhost:8080/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or
`go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file).
API-changing PRs must include an updated spec; CI regenerates and fails if it is stale.
Source of truth: `internal/httpapi/`.
