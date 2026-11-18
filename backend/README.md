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

Run from `backend/`. The full stack uses ports 80, 5432, and 9000; optional pgAdmin uses 5050.

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

To run the API directly on the host, copy `.env.example` to `.env`, stop the API container with
`docker compose --env-file ../iam/.env -f ../deploy/compose.yaml stop api`, and run `make run`.
`make run` and `make test` load the backend `.env`; bare `make` runs tests.
The host process listens on port 8080 directly (`HTTP_ADDR=:8080`). To return to the full Compose stack, run `make up`.

`make down` stops the entire stack, including frontend, proxy, and IAM, and preserves data and secrets.

> **Warning:** `make reset` stops the entire stack and deletes its backend, pgAdmin, and Authentik data volumes.
> It keeps `iam/.env`; `make up` provisions a fresh stack afterward.

## Authentication

The React SPA authenticates directly with Authentik under `/auth/` (hosted Authentik login UI using OIDC Authorization Code Flow with PKCE)
and sends `Authorization: Bearer <JWT>` on every `/api/v1/*` request.
The Go API is 100% stateless across replicas: it verifies incoming `Bearer` JWTs (`RS256`, `iss`, `aud`, `exp`, and required `sub`, `name`,
`email` claims) against Authentik's JWKS keys (`OIDC_JWKS_URL`, cached in memory per replica) and resolves `sub` (`hashed_user_id`) to the local
`iam_user.id` UUID via an in-memory TTL cache backed by `UpsertIAMUser`.
`GET /api/v1/me` returns the authenticated caller's internal `id`, `issuer`, `subject`, `name`, and `email`.

## Authorization

Project roles (Viewer, Editor, Owner) and how to protect an endpoint are specified in
[project roles](../docs/internal/architecture/iam/project-roles.md); the helpers are in
`internal/httpapi/handlers/project_access.go`. Access is denied by default: every `/api/` operation is registered with
`handlers.Register` and an access declaration, and the API panics at startup if one is missing. Members are managed under
`/api/v1/projects/{id}/members`; member and project changes are written as `audit` log entries.

Adding members and showing member names needs the Authentik Core API through `AUTHENTIK_API_URL` and `AUTHENTIK_API_TOKEN`.
The Compose stack sets both (see [IAM README](../iam/README.md#project-roles-groups-and-api-access)). For `make run` on the
host, copy the token from `iam/.env` into `backend/.env` (see `.env.example`). Without them the API starts,
omits member names, and returns 503 for adding members and for `GET /api/v1/groups`.

## Logging

The API writes JSON log lines to stderr; `LOG_LEVEL` sets the minimum level (`debug`, `info`, `warn`, `error`; default `info`).

- Every request gets an ID: NGINX sets `X-Request-ID` to its `$request_id`, which also appears in its access log, and the API
  returns it in the response. Log lines written with the request context carry it as `request_id`. Without NGINX (for
  example `make run`), the API keeps an ID the client sends, so such IDs are only trustworthy behind the proxy.
- One `request` line per request with method, path, route, status, duration, and the caller's internal user ID (`actor`).
  Health checks are logged at `debug`.
- Security entries: `authentication failed` (with `reason`) and `access denied` (with `operation`, `status`, and `actor`;
  `warn` for 403, `info` for 404, which also covers records that no longer exist).
- Errors that a handler does not map to an HTTP status are logged as `unexpected error` (or `request cancelled` at `info` if
  the client went away); the client gets a plain 500 without the error text. That text can contain input values, for
  example from PostgreSQL errors. Panics are logged with their stack trace.
- In the Compose stack, set `LOG_LEVEL` in `iam/.env`.

What is logged and what is stored as audit history is described in [Audit and logging](../docs/internal/architecture/audit.md).

## Checks

```sh
curl -f http://localhost/health/ready
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
internal/logging/              JSON logger, request IDs, request log
```

Health checks: `GET /health/live` and `GET /health/ready` (readiness checks Postgres).

## Item definitions

All routes below require an Authentik-issued Bearer JWT and are under `/api/v1/projects/{project_id}/item-definitions`.

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
`boundary`, `functions`, `operational_environment`, `item_definition_wp_09_01`,
`cybersecurity_specs_wp_10_01`, and `architectural_design`.
The three definition fields can be filled in independently after creating a draft item. The legacy
`item_definition_wp_09_01` remains available for unstructured imported definitions; it is not synchronized
with the three structured fields.
PATCH accepts explicit `null` to clear optional fields; `name` and `scope_type` cannot be null.
The database supplies `id` and `created_at`, which updates preserve.

Use Swagger UI at `/api/docs` and authorize with a Bearer JWT to try the routes. Example
request body for POST:

```json
{
  "name": "Headlamp",
  "scope_type": "ITEM",
  "lifecycle_phase": "development"
}
```

Access uses the [shared project authorization](../docs/internal/architecture/iam/project-roles.md):
Viewers can read; Editors and Owners can create, replace, update, or delete. Direct assignments and
assignable Authentik groups from the signed `taramisu_groups` token claim are supported.

Invalid inputs return 422. Missing or inaccessible projects and items return 404; members whose role
is too low receive 403. Deleting an item also deletes its assets, damage scenarios, threat scenarios,
attack paths, and their dependent properties, links, ratings, risk values, and treatment decisions.
The frontend must ask for confirmation before deletion. Responses use the existing problem JSON
error format without database details.

Regenerate queries with `make sqlc` and the contract with `make openapi`. Run `make test`
for authenticated route/validation tests and set `TEST_DATABASE_URL` to a migrated database
for PostgreSQL CRUD, pagination, role, token-group access, and cascade-deletion tests. Database tests
roll back their fixtures and do not require a live Authentik instance.

## Asset cybersecurity properties and scenario links

[API contract and request examples](../docs/internal/dev-workflow/asset-properties-api.md)
cover assets, cybersecurity properties, and damage/threat scenario links. All routes require a
Bearer JWT and a project role: Viewers can read; Editors and Owners can write. The shared
project check runs before the handler, and SQL restricts records and references to the URL item.

## Risk values and treatment decisions

The risk API provides authenticated CRUD under `/api/v1/threat-scenarios/{threat_scenario_id}/risk-values`
and `/api/v1/threat-scenarios/{threat_scenario_id}/risk-treatment-decisions`.
It uses the existing schema and shared project authorization: Viewers can read; Editors and Owners can write.
Non-members receive 404; members with insufficient roles receive 403. Related records and treatment claims are validated.
See the [frontend API handoff](../docs/internal/dev-workflow/risk-api.md) for methods, fields, pagination, and errors.

## OpenAPI contract

With the Compose stack running: OpenAPI 3.1 at [http://localhost/openapi.json](http://localhost/openapi.json), Swagger UI at
[/api/docs](http://localhost/api/docs) (or `http://localhost:8080/openapi.json` and `http://localhost:8080/docs` when running standalone
on the host via `make run`, default `HTTP_ADDR=:8080`).
Example: `curl -fsS "http://localhost/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or
`go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file).
API-changing PRs must include an updated spec; CI regenerates and fails if it is stale.
Source of truth: `internal/httpapi/`.
