# Taramisu backend

Go API with [Chi](https://github.com/go-chi/chi) and [Huma](https://huma.rocks) (OpenAPI + Swagger UI at `/docs`).

## Commands

```bash
go run ./cmd/api
go test ./...
```

`HTTP_ADDR` overrides the listen address (default `:8080`).

## Structure

```
cmd/api/                 entrypoint
internal/httpapi/        router
internal/httpapi/handlers/
```

Health checks: `GET /health/live`, `GET /health/ready`.
