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

Run from `backend/`:

```bash
cp .env.example .env
make db migrate
make run
make up
make down
make reset
make test
make migrate-diff name=my_change
make sqlc
```

`make up` runs [`dev.sh`](dev.sh) to start the backend and Authentik using
`iam/.env`; `make down` stops both and keeps their data. See [IAM setup](../iam/README.md).

For `make run`, copy `.env.example` to `.env` and use the client ID, secret and
`APP_URL` from `../iam/.env`. Stop the API container first with
`docker compose --env-file ../iam/.env -f ../iam/compose.yaml stop api`.
`make run` and `make test` load `.env`; bare `make` runs tests.

`make db` uses a separate database on port 5432. Stop it with
`docker compose --profile tools down` before starting the combined stack.

> **Warning:** `make reset` deletes the standalone backend database volume. It does not reset the Authentik stack.

## Structure

```
cmd/api/                       entrypoint
db/                            schema, Atlas migrations, sqlc queries
internal/db/                   sqlc-generated query code
internal/httpapi/              router, OpenAPI
internal/httpapi/handlers/     HTTP handlers
```

Health checks: `GET /health/live` and `GET /health/ready` (readiness checks Postgres).
See [IAM setup](../iam/README.md) for login, logout and `/api/v1/me`.
