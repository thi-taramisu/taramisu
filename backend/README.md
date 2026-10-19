# Taramisu backend

Go HTTP API for Taramisu.

- **[Chi](https://github.com/go-chi/chi)** — routing
- **[Huma](https://huma.rocks)** — handlers, OpenAPI 3.1, Swagger UI at `/docs`
- **PostgreSQL** + **pgx** — database
- **sqlc** — queries in `db/queries/` → `internal/db/`
- **Atlas** — migrations from `db/schema.sql` in `db/migrations/`
- **Docker Compose** — Postgres, migrate, optional API container

## Prerequisites

- Docker (Compose), Go 1.25+, make
- [sqlc](https://docs.sqlc.dev/en/latest/overview/install.html) v1.31.1 — only to regenerate `internal/db/` after changing `db/queries/` or `db/schema.sql`

## Commands

```bash
cp .env.example .env
make db migrate
make run
make up
make down
make reset
make test
make openapi
make migrate-diff name=my_change
make sqlc
```

Copy `.env.example` once; the Makefile loads `.env` for `make run` and `make test`. `make down` stops Compose but keeps Postgres data.

> **Warning:** `make reset` runs `docker compose down -v` and **deletes the local Postgres volume** (all data in the Compose `postgres_data` volume). Use it when you want a clean database, not for a normal stop.

## Structure

```
cmd/api/                       entrypoint
cmd/openapi/                   offline OpenAPI JSON export (stdout)
db/                            schema, Atlas migrations, sqlc queries
internal/db/                   sqlc-generated query code
internal/httpapi/              router, OpenAPI
internal/httpapi/handlers/     HTTP handlers
```

So far the API only has health checks: `GET /health/live` and `GET /health/ready` (readiness uses Postgres after migrate). No domain routes yet.

## OpenAPI contract

With the API running (default `:8080`, overridable via `HTTP_ADDR`): OpenAPI 3.1 at [http://localhost:8080/openapi.json](http://localhost:8080/openapi.json), UI at [/docs](http://localhost:8080/docs). Example: `curl -fsS "http://localhost:8080/openapi.json" -o openapi.json`.

For offline use and CI, commit [`openapi.json`](openapi.json) and refresh with `make openapi` (or `go run ./cmd/openapi > openapi.json`; no DB or running server—`make up`/`make run` do not update the file). API-changing PRs must include an updated spec; CI regenerates and fails if it is stale. Source of truth: `internal/httpapi/`.
