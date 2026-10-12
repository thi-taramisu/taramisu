# Taramisu backend

Go HTTP API for Taramisu.

- **[Chi](https://github.com/go-chi/chi)** — routing
- **[Huma](https://huma.rocks)** — handlers, OpenAPI 3.1, Swagger UI at `/docs`
- **PostgreSQL** + **pgx** — database
- **sqlc** — queries in `db/queries/` → `internal/db/`
- **Atlas** — migrations from `db/schema.sql` in `db/migrations/`
- **Docker Compose** — Postgres, migrate, optional API container

## Commands

```bash
cp .env.example .env
make db migrate
make run
make up
make down
make reset
make test
make migrate-diff name=my_change
```

Copy `.env.example` once; the Makefile loads `.env` for `make run` and `make test`. `make down` stops Compose but keeps Postgres data.

> **Warning:** `make reset` runs `docker compose down -v` and **deletes the local Postgres volume** (all data in the Compose `postgres_data` volume). Use it when you want a clean database, not for a normal stop.

## Structure

```
cmd/api/                       entrypoint
db/                            schema, Atlas migrations, sqlc queries
internal/db/                   sqlc-generated query code
internal/httpapi/              router, OpenAPI
internal/httpapi/handlers/     HTTP handlers
```

So far the API only has health checks: `GET /health/live` and `GET /health/ready` (readiness uses Postgres after migrate). No domain routes yet.
