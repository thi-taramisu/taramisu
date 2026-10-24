# Taramisu backend

Go HTTP API for Taramisu.

- **[Chi](https://github.com/go-chi/chi)** — routing
- **[Huma](https://huma.rocks)** — handlers, OpenAPI 3.1, Swagger UI at `/docs`
- **PostgreSQL** + **pgx** — database
- **sqlc** — queries in `db/queries/` → `internal/db/`
- **Atlas** — migrations from `db/schema.sql` in `db/migrations/`
- **Docker Compose** — Postgres, migrate, optional API container

## Prerequisites

- Docker Compose v2.20+, Go 1.25+, make, OpenSSL and curl
- [sqlc](https://docs.sqlc.dev/en/latest/overview/install.html) v1.31.1 — only to regenerate `internal/db/` after changing `db/queries/` or `db/schema.sql`

## Commands

Run from `backend/`, with ports 5432, 8080 and 9000 free:

```bash
make up
make migrate
make test
make openapi
make migrate-diff name=my_change
make sqlc
make down
```

`make up` runs [`dev.sh`](dev.sh) and starts two Compose projects using `iam/.env`:

- `taramisu-backend`: API, backend database and migrations ([compose.yaml](compose.yaml)).
- `taramisu-iam`: Authentik server, worker and database ([IAM configuration](../iam/README.md)).

Startup provisions Authentik first, then starts the backend, applies migrations and
waits for readiness. The API and Authentik server share the `taramisu-auth` network,
created by the IAM project; each database stays on its own project's default network.
`make down` stops the backend first, then IAM, and keeps their data.
Run `make up` once to generate `iam/.env`; `make db` starts just the backend database.

To run the API on the host, start the stack with `make up`, copy `.env.example`
to `.env` and use the client ID, secret and `APP_URL` from `../iam/.env`.
Stop the API container first with
`docker compose --env-file ../iam/.env -f compose.yaml stop api`, then run `make run`.
`make run` and `make test` load `.env`; bare `make` runs tests.

> **Warning:** `make reset` stops the whole stack and deletes backend and Authentik data. It keeps `iam/.env`; `make up` provisions a fresh stack afterward.

## Authentication

Open <http://localhost:8080/auth/login> with user `dev` and `DEV_PASSWORD` from
`../iam/.env`. Login returns `/api/v1/me` with the local user ID, issuer and subject.
`APP_URL` must be an origin without a trailing slash and determines the callback URL.
`POST /auth/logout` ends the backend session and requires `Origin` to match `APP_URL`.
Sessions last eight hours and are lost on API restart. Logout leaves the Authentik
SSO session active. Group synchronization is not implemented. Item definition routes enforce
the project role assignments stored in the database; other routes do not yet implement project permissions.

## Checks

```sh
curl -f http://localhost:8080/health/ready
sh dev_test.sh
make test
TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu?sslmode=disable' make test
```

Database tests need the running stack; they are skipped without `TEST_DATABASE_URL`.
API logs: `docker compose --env-file ../iam/.env -f compose.yaml logs api`.

## Structure

```
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

With the API running (default `:8080`, overridable via `HTTP_ADDR`): OpenAPI 3.1 at [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json), UI at [/docs](http://localhost:8080/docs). Example: `curl -fsS "http://localhost:8080/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or `go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file). API-changing PRs must include an updated spec; CI regenerates and fails if it is stale. Source of truth: `internal/httpapi/`.
