# Taramisu backend

Go HTTP API for Taramisu.

- **[Chi](https://github.com/go-chi/chi)** — routing
- **[Huma](https://huma.rocks)** — handlers, OpenAPI 3.1, Swagger UI at `/docs`
- **PostgreSQL** + **pgx** — database
- **sqlc** — queries in `db/queries/` → `internal/db/`
- **Atlas** — migrations from `db/schema.sql` in `db/migrations/`
- **Docker Compose** — Postgres, migrate, optional API container, optional pgAdmin

## Prerequisites

- Docker Compose v2.23.1+, Go 1.25+, make, OpenSSL and curl
- [Atlas](https://atlasgo.io/getting-started#installation) v1.3.0 — optional locally (Compose runs `arigaio/atlas:1.3.0`)
- [sqlc](https://docs.sqlc.dev/en/latest/overview/install.html) v1.31.1 — to regenerate or verify `internal/db/` after
  changing `db/queries/` or `db/schema.sql`

## Commands

Run from `backend/`. The full stack uses ports 80, 5432, 8080 and 9000; optional pgAdmin uses 5050.

```bash
make up
make pgadmin
make migrate
make test
make openapi
make migrate-diff name=my_change
make migrate-validate
make sqlc
make sqlc-diff
make lint
make fmt
make down
```

`make up` delegates to [`deploy/dev.sh`](../deploy/dev.sh) and starts the `taramisu` Compose project:
API, backend database and migrations, Authentik, frontend, and proxy. Startup provisions Authentik before starting the API.
See the [deployment README](../deploy/README.md) for setup, networking, and migration from the former two-project layout.

Container commands use `iam/.env`; `make init` generates it without starting services.
`make db` starts only the backend database, and `make migrate` applies its migrations.
These commands initialize the configuration automatically if needed.

`make pgadmin` starts [pgAdmin](https://www.pgadmin.org/) at <http://localhost:5050> (no login),
connected to the backend database. It remains opt-in through the `tools` profile.

To run the API on the host, copy `.env.example` to `.env` and copy the OIDC settings from `../iam/.env`.
Set `APP_URL=http://localhost:8080` in both files, then run `make up` to update the Authentik callback.
Stop the API container with
`docker compose --env-file ../iam/.env -f ../deploy/compose.yaml stop api`, then run `make run`.
`make run` and `make test` load the backend `.env`; bare `make` runs tests.
Use port 8080 directly in this mode. To return to the full Compose stack, restore `APP_URL=http://localhost`
in `../iam/.env` and run `make up`.

`make down` stops the entire stack, including frontend, proxy, and IAM, and preserves data and secrets.

> **Warning:** `make reset` stops the entire stack and deletes its backend, pgAdmin, and Authentik data volumes.
> It keeps `iam/.env`; `make up` provisions a fresh stack afterward.

## Authentication

Open <http://localhost/auth/login> with user `dev` and `DEV_PASSWORD` from
`../iam/.env`. Login returns `/api/v1/me` with the local user ID, issuer and subject.
The Compose proxy forwards `/api/v1/` and `/auth/` to the backend without stripping their prefixes.
`APP_URL` must be an origin without a trailing slash and determines the callback URL.
`POST /auth/logout` ends the backend session and requires `Origin` to match `APP_URL`.
Sessions last eight hours and are lost on API restart. Logout leaves the Authentik
SSO session active. Group synchronization is not implemented. Item definition routes enforce
the project role assignments stored in the database; other routes do not yet implement project permissions.

## Checks

```sh
curl -f http://localhost:8080/health/ready
make -C ../deploy test
make test
TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu?sslmode=disable' make test
```

Database tests need the running stack; they are skipped without `TEST_DATABASE_URL`.
API logs: `docker compose --env-file ../iam/.env -f ../deploy/compose.yaml logs api`.

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

Health checks: `GET /health/live` and `GET /health/ready` (readiness checks Postgres).

## Item definitions

Requires the authentication foundation from PR #75. All routes below use the existing
Authentik-backed session cookie and are under `/api/v1/projects/{project_id}/item-definitions`.

| Method | Path suffix | Result |
| --- | --- | --- |
| GET | (none) | List items, with `limit` (default 50, maximum 100) and `offset` (default 0) |
| POST | (none) | Create an item; return 201 and a `Location` header |
| GET | `/{item_id}` | Read an item |
| PUT | `/{item_id}` | Replace an existing item; omitted optional fields become null |
| PATCH | `/{item_id}` | Update supplied fields; omitted fields stay unchanged |
| DELETE | `/{item_id}` | Delete an item; return 204 |

Create and replace require a nonblank `name` (up to 255 characters) and `scope_type`
(`ITEM` or `COMPONENT`). Optional text fields are `lifecycle_phase`,
`item_definition_wp_09_01`, `cybersecurity_specs_wp_10_01`, and `architectural_design`.
PATCH accepts explicit `null` to clear optional fields; `name` and `scope_type` cannot be null.
The database supplies `id` and `created_at`, which updates preserve.

After logging in, use Swagger UI at `/docs` on the same origin to try the routes. Example
request body for POST:

```json
{
  "name": "Headlamp",
  "scope_type": "ITEM",
  "lifecycle_phase": "development"
}
```

The user must have a `project_role_assignment` for the parent project, either directly or
through an existing `iam_user_group_member` record. All assigned project roles can read;
only `OWNER` and `EDITOR` can create, replace, update, or delete. Creating projects and
managing role assignments are separate work: login does not automatically grant project access.
Group membership is read from the local database, not synchronized from Authentik by this change.

Invalid inputs return 422. Missing or inaccessible projects and items return 404. Deleting
an item with dependent assets, scenarios, or attack paths returns 409; those records are not
cascaded away. Responses use the existing problem JSON error format without database details.

Regenerate queries with `make sqlc` and the contract with `make openapi`. Run `make test`
for authenticated route/validation tests and set `TEST_DATABASE_URL` to a migrated database
for PostgreSQL CRUD, pagination, role, group-access, and foreign-key tests. Database tests
roll back their fixtures and do not require a live Authentik instance.

## OpenAPI contract

With the API running (default `:8080`, overridable via `HTTP_ADDR`): OpenAPI 3.1 at
[http://localhost:8080/openapi.json](http://localhost:8080/openapi.json), UI at [/docs](http://localhost:8080/docs).
Example: `curl -fsS "http://localhost:8080/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or
`go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file).
API-changing PRs must include an updated spec; CI regenerates and fails if it is stale.
Source of truth: `internal/httpapi/`.
