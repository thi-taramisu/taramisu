# Taramisu backend

Go API with [Chi](https://github.com/go-chi/chi) and [Huma](https://huma.rocks) (OpenAPI + Swagger UI at `/docs`).

## Commands

```bash
cp .env.example .env
make db migrate    # Postgres in Docker, apply migrations
make run           # http://localhost:8080
make test
```

`HTTP_ADDR` and `DATABASE_URL` are loaded from `.env` when you use the Makefile (see `.env.example`).

## Structure

```
cmd/api/
db/                  schema, migrations, sqlc queries
internal/db/         sqlc-generated code
internal/httpapi/
internal/httpapi/handlers/
```

Health: `GET /health/live`, `GET /health/ready`. Readiness returns `status` and the `message` row from Postgres (after migrate).
