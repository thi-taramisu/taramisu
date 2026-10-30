# Backend Architecture Overview

## Architecture

``` text
router.go
   |
   | Calls Register(api) on each handler
   v
newAPI / API handler
   |
   | Handles requests and business logic
   v
Store interface
   |
   +----> Real Store
   |         |
   |         v
   |      Generated DB code
   |         |
   |         v
   |      *.sql files
   |      (queries for sqlc)
   |
   +----> Fake Store
             |
             v
          Unit tests
```

## Responsibilities

- **`router.go`** - Sets up the API and authentication, and calls `handlers.NewX(queries).Register(api)` once per resource. It does not
  list routes itself. `Queries` embeds the store interface of every resource.
- **`Register(api)`** - Method on each handler. Maps all routes of that resource (paths, methods, tag, security, status codes) to the
  handler's methods in the same file.
- **`newAPI`****/****`API`** - Holds dependencies and implements HTTP handlers and business logic.
- **`Store`** **interface** - Provides database operations through an interface.
- **Real Store** - Executes database queries through generated DB code.
- **`*.sql`****files** - Define SQL queries. Generated DB code can be created with `make sqlc`.
- **Fake Store** - Implements the same interface for tests, avoiding a real database.

## Core Principle

The API depends on an abstraction (`Store`), not directly on the database. Production uses the real Store; tests inject the Fake Store.

## Adding a Resource

1. In the handler file, add `NewX(store)` and `Register(api)`, which registers all routes of the resource.
2. Embed the resource's store interface in `Queries` in `router.go`.
3. Add `handlers.NewX(queries).Register(api)` to `newAPI`.

A missing `Register` call in step 3 compiles, but the routes return `404`. A route test through `httpapi.New` catches it.

## Testing Routes

Route tests send real HTTP requests through `httpapi.New`, so the router, the authentication middleware and the handler are all exercised
together. Handlers are not registered on a bare `humatest` API, because that skips routing and authentication.

- **Fake Store** - Replaces the database, not the router. A fake must satisfy the `Queries` interface passed to `httpapi.New`; embed the
  interfaces it does not implement.
- **Authentication** - `/api/` routes require a session. Tests call `authtest.Login(t)` (`backend/internal/auth/authtest/authtest.go`),
  which returns a real `*auth.Manager` backed by a fake OIDC provider and a valid `taramisu_session` cookie. Pass the manager to
  `httpapi.New` and add the cookie to each request. `authtest` is a temporary fake of the login flow and may change, so tests should only
  use `authtest.Login` and not build their own.
- **Unauthenticated requests** - Tests that expect `401` send the request without the cookie.
