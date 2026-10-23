# Backend instructions

## Scope and ownership

The Backend team maintains these instructions, together with IAM/Security for authentication and authorization changes.
Shared rules are in [../AGENTS.md](../AGENTS.md).
This folder contains the Go API, PostgreSQL schema, Atlas migrations, sqlc queries, and generated OpenAPI contract.

## Conventions and generated files

- Follow the existing Chi/Huma handlers and pgx/sqlc patterns. Read [README.md](README.md) before changing startup or database behavior.
- Keep SQL sources in `db/queries/` and the desired schema in `db/schema.sql`.
- Regenerate `internal/db/` using `make sqlc`; do not edit sqlc output by hand.
- Include an Atlas migration for schema changes. Use `make migrate-diff name=descriptive_name` and inspect the generated migration.
- Treat `internal/httpapi/` as the API source of truth. Refresh `openapi.json` with `make openapi` when the contract changes.
- Coordinate API changes with frontend consumers; the frontend currently generates types from its separate stub.
- Follow the existing authentication and project authorization patterns on the branch being changed; do not assume draft designs exist.

## Setup and verification

Use the Go version declared in `go.mod`. Copy `.env.example` to `.env` for local development; never commit the populated file.
Run these commands from `backend/`:

```sh
make db migrate       # start and migrate the local development database
make run              # start the API
make test             # go test -race ./...
make lint             # golangci-lint run ./...
go build ./cmd/...    # compile the API and OpenAPI exporter
make openapi          # regenerate the committed API contract
```

`make test` skips PostgreSQL integration tests unless `TEST_DATABASE_URL` points to a migrated test database.
Report that skip explicitly. Keep test data isolated from development or shared databases.
Use `make down` for a normal stop; `make reset` removes local database volumes.

## Team maintenance

Keep setup, migration, API, and verification guidance aligned with the Makefile and CI.
Add service-specific instructions when new backend areas need conventions that do not belong here.
