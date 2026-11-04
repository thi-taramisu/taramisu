# Backend instructions

The Backend team maintains this file and coordinates authentication and authorization changes with IAM/Security.
Shared instructions are in [../AGENTS.md](../AGENTS.md).

## References

- [README.md](README.md): setup, database migrations, sqlc, OpenAPI, tests, and coverage.
- [Deployment README](../deploy/README.md): shared stack startup and configuration.
- [Makefile](Makefile) and [go.mod](go.mod): available targets and Go toolchain.

## Editing rules

- Follow the existing Chi/Huma handlers and pgx/sqlc patterns.
- Keep schema/query changes, Atlas migrations, and regenerated sqlc output consistent using the README's database workflow.
- For API changes, follow the README's OpenAPI workflow and the [frontend API workflow](../frontend/README.md#api-client)
  to update the OpenAPI spec and generated TypeScript types.
- Use the authentication and project authorization behavior implemented on the target branch.

## Verification

Use the README's checks for the affected area. Report when PostgreSQL integration tests were skipped because `TEST_DATABASE_URL`
was not configured; keep test data isolated from shared databases.
Check the deployment guide before changing stack lifecycle commands or secrets handling.
