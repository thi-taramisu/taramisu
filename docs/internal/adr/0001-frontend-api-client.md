# ADR 0001: Frontend API client

- Status: Proposed, still needs to be agreed on in the team
- Issue: #31
- Related: #6 (wireframes / API contract), #46 (IAM evaluation), #32 (UI library, [ADR 0002](0002-frontend-ui-library.md))

## Context

So far the frontend (React 19, TypeScript, Vite, Vitest) doesn't talk to the backend at all. The backend is written in Go and publishes an
OpenAPI spec, which is our API contract. Before everyone starts writing their own `fetch` calls, we should agree on one way to access the
backend.

What we want from the client:

| # | Requirement |
| :--- | :--- |
| R1 | Types follow the API contract, so a contract change breaks the build and not production |
| R2 | Errors are handled the same way everywhere (typed error bodies, 401 handled in one place) |
| R3 | Auth token handling doesn't depend on which IAM we pick (#46) |
| R4 | Caching and loading/error states for server data |
| R5 | Can be tested without a running backend |
| R6 | Small, and not much generated code we have to review and maintain |

## Options

1. **Hand-written `fetch` wrapper with our own types.** No dependencies, but we'd be copying types by hand and they will drift from the
   spec sooner or later (R1). We'd also have to build caching and loading states ourselves (R4).
2. **`openapi-typescript` + `openapi-fetch`, with TanStack Query via `openapi-react-query`.** The types are generated from the spec.
   `openapi-fetch` is a small (~6 KB) typed wrapper around `fetch` that supports middleware, and `openapi-react-query` gives us typed
   `useQuery`/`useMutation` hooks on top. Only types are generated, no runtime code.
3. **Full code generation (Orval or `@hey-api/openapi-ts`).** Generates the client functions and, if you want, the query hooks too.
   Just as type safe as option 2, but it puts a lot of generated runtime code into the repo that someone has to review and configure (R6).

| Option | R1 types | R2 errors | R3 auth | R4 caching | R5 tests | R6 size |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1. Manual fetch | ✗ by hand | by hand | by hand | by hand | ✓ | ✓ smallest |
| 2. openapi-fetch + Query | ✓ | ✓ typed `error`, middleware | ✓ middleware | ✓ TanStack Query | ✓ inject `fetch` / MSW | ✓ only types generated |
| 3. Full codegen | ✓ | ✓ | ✓ | ✓ if hooks are generated | ✓ | ✗ generated code |

## Decision

I suggest we go with option 2. `openapi-typescript` generates `src/api/schema.d.ts` from the spec, `openapi-fetch` does the HTTP calls, and
components use `openapi-react-query` (on top of TanStack Query) for caching and loading states.

`createApiClient()` in `src/api/client.ts` wraps `createClient<paths>` and adds a middleware with two hooks:

- `getToken` returns the bearer token. Where the token comes from is left open until #46 is decided.
- `onUnauthorized` gets called whenever a request comes back with 401.

The tests mock the API with MSW, so no backend is needed to run them.

The types are generated from the backend's spec `backend/openapi.json` (#56, switched over in #118) with `npm run generate:api`. Its paths
are complete (`/api/v1/me`, `/health/live`, `/auth/login`), because the backend mounts them that way and the proxy forwards the full URI, so
the client's base URL is only the origin. Views that need routes the spec doesn't have yet use service interfaces with mock implementations
in `src/api/mocks/`; `src/main.tsx` decides between real and mock (see `frontend/README.md`).

## Consequences

- If the contract changes, we get TypeScript errors after regenerating `schema.d.ts`. The file is committed, so reviewers can see contract
  changes in the diff.
- New runtime dependencies: `openapi-fetch`, `@tanstack/react-query`, `openapi-react-query`. New dev dependencies: `openapi-typescript`, `msw`.
- One thing to keep an eye on: the latest `openapi-typescript` (7.13.0) declares `typescript ^5` as its peer dependency, but we're on
  TypeScript 6. We only use it as a CLI at build time and generation works fine, so I overrode the peer range for just that package
  (`overrides` in `package.json`). We should remove the override once there's a release that supports TS 6.
- The spec lives in `backend/openapi.json` and `schema.d.ts` stays committed. CI regenerates it and fails if the committed file differs,
  also when only `backend/openapi.json` changed (#118).
- If the spec turns out not to work well with `openapi-typescript`, we can switch to option 3. The call sites would look pretty similar.
- Picking a server-state library is part of this decision. If the team would rather not use TanStack Query yet, `openapi-fetch` works fine
  without it.
