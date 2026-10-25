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
- [sqlc](https://docs.sqlc.dev/en/latest/overview/install.html) v1.31.1 — only to regenerate `internal/db/` after
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
make sqlc
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
SSO session active. Group synchronization and project permissions are not implemented.

## Checks

```sh
curl -f http://localhost:8080/health/ready
make -C ../deploy test
make test
TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu?sslmode=disable' make test
```

Database tests need the running stack; they are skipped without `TEST_DATABASE_URL`.
API logs: `docker compose --env-file ../iam/.env -f ../deploy/compose.yaml logs api`.

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

## OpenAPI contract

With the API running (default `:8080`, overridable via `HTTP_ADDR`): OpenAPI 3.1 at
[http://localhost:8080/openapi.json](http://localhost:8080/openapi.json), UI at [/docs](http://localhost:8080/docs).
Example: `curl -fsS "http://localhost:8080/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or
`go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file).
API-changing PRs must include an updated spec; CI regenerates and fails if it is stale.
Source of truth: `internal/httpapi/`.
