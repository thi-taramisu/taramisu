# Backend Architecture Overview

## Architecture


``` text
router.go
   |
   | Maps HTTP routes to handlers
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

- **`router.go`** - Registers routes and connects them to API handler functions.
- **`newAPI`****/****`API`** - Holds dependencies and implements HTTP handlers and business logic.
- **`Store`** **interface** - Provides database operations through an interface.
- **Real Store** - Executes database queries through generated DB code.
- **`*.sql`****files** - Define SQL queries. Generated DB code can be created with `make sqlc`.
- **Fake Store** - Implements the same interface for tests, avoiding a real database.

## Core Principle

The API depends on an abstraction (`Store`), not directly on the database. Production uses the real Store; tests inject the Fake Store.