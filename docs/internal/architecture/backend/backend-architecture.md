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
   |         +----> Integration tests
   |         |      (PostgreSQL, rolled-back transaction)
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

## Conflicting edits

Two users can open the same record, change it, and save. Without a check, the second save silently overwrites the first, also
in fields the second user did not touch, because forms send all their fields. Transactions do not prevent this: each save is
consistent on its own, but it is based on a state the user read minutes earlier. Taramisu therefore uses optimistic
concurrency control with HTTP preconditions ([#241](https://github.com/thi-taramisu/taramisu/issues/241)), instead of locks
that users hold while they edit.

- **Version.** Every editable table has a `version` column. Every update raises it (`version = <table or alias>.version + 1`); deletes
  and cascades do not need to. `TestEveryUpdateRaisesTheVersion` checks the queries, because Atlas manages triggers only in
  its paid edition. Tables without fields to overwrite (links) and tables that are never edited are listed as exceptions in
  that test.
- **Responses.** Records return their version as the `version` field, so that lists carry it too, and single records also as
  the `ETag` header, for example `"3"`.
- **Requests.** `PUT`, `PATCH`, and `DELETE` send the version they are based on as `If-Match: "3"`. If the record has changed
  in the meantime, the API answers `412 Precondition Failed` with the current `ETag`, changes nothing, and records no audit
  event. `*` matches any version. A missing record is still `404`.
- **Saving without a change** keeps the version: `Store.Audit` rolls back a change that records no event, so others who read
  the record before can still save. The handler then returns the record as it was before the change, because the record that
  the update returned carries a version that was never committed.
- **Scope.** The version covers the record's own fields, not the lists of records below it. Creating a record needs no
  version.
- **Transition.** Until the frontend sends `If-Match`, a request without it is not checked. Afterwards the header becomes
  required (`428 Precondition Required`).
- **Current state.** All editable tables have the column and every update raises it, but only project settings, project
  deletion, members, and item definitions return the version and check `If-Match` so far. `notVersionedYet` in
  `TestEveryChangeIsDeclaredForVersions` lists the operations that follow.

In a handler, embed `IfMatch` in the input of the operation and call `check` with the version of the record that the change
has locked (`FOR UPDATE` or `FOR NO KEY UPDATE`) inside `Audit`. The row stays locked until the commit, so no other change can
come in between the check and the write. Store methods that lock the record themselves take a `db.VersionCheck` instead.
`TestEveryChangeIsDeclaredForVersions` lists every `PUT`, `PATCH`, and `DELETE` as versioned, not versioned yet, or
unversioned; a new operation must be added to one of the lists.

## Testing Routes

Route tests send real HTTP requests through `httpapi.New`, so the router, the authentication middleware and the handler are all exercised
together. Handlers are not registered on a bare `humatest` API, because that skips routing and authentication.

- **Fake Store** - Replaces the database, not the router. A fake must satisfy the `Queries` interface passed to `httpapi.New`; embed the
  interfaces it does not implement.
- **Authentication** - `/api/` routes require a Bearer JWT. Tests call `authtest.NewManagerAndToken(t)`
  (`backend/internal/auth/authtest/authtest.go`), which returns a real `*auth.Manager` backed by a local JWKS server and a valid
  `Bearer <JWT>` value. Pass the manager to `httpapi.New` and set the value as the `Authorization` header of each request. Tests that need
  custom claims use `authtest.NewFixture` and `Fixture.Token`; tests should not sign their own tokens.
- **Unauthenticated requests** - Tests that expect `401` send the request without the `Authorization` header.

### Two test types per resource

- **Unit test** - Wide matrix (status codes, validation, error mapping) with a fake store. No database, always runs.
- **Integration test** - One lifecycle (create, get, update, replace, delete) through `httpapi.New` against `db.New(tx)`. It runs inside a
  transaction that is rolled back and skips without `TEST_DATABASE_URL`.

Both go through the same entry point. Only the store differs. Run the integration tests with the stack's database, see the backend README.
