# ADR 0001: Frontend API client

- **Status:** Proposed (to be agreed with the team)
- **Issue:** #31
- **Related:** #6 (wireframes / API contract), #46 (IAM evaluation), #32 (UI library)

## Context

The frontend (React 19, TypeScript, Vite, Vitest) has no backend access yet. The backend will be written in Go and will publish an **OpenAPI spec** as the API contract. We need one client approach so that backend access is typed and consistent.

### Requirements

| # | Requirement |
|---|-------------|
| R1 | Type safety against the API contract; a contract change should break the build, not production |
| R2 | Uniform error handling (typed error bodies, central 401 handling) |
| R3 | Auth token handling that does not depend on the IAM choice (#46) |
| R4 | Caching and loading/error states for server data |
| R5 | Easy to test without a running backend |
| R6 | Small footprint and little generated code to review and maintain |

## Options

1. **Hand-written `fetch` wrapper with manual types.** No dependencies, but types are duplicated by hand and drift from the spec (fails R1). Caching and loading states must be built by us (R4).
2. **`openapi-typescript` + `openapi-fetch` (+ TanStack Query via `openapi-react-query`).** Types are generated from the spec; `openapi-fetch` is a ~6 KB typed `fetch` wrapper with middleware, and `openapi-react-query` adds typed `useQuery`/`useMutation` hooks. No generated runtime code.
3. **Full code generation (Orval, `@hey-api/openapi-ts`).** Generates client functions and optionally query hooks. Equally type safe, but generated runtime code in the repo is more to review and configure (R6).

| | R1 types | R2 errors | R3 auth | R4 caching | R5 tests | R6 weight |
|---|---|---|---|---|---|---|
| 1. Manual fetch | ✗ manual | manual | manual | manual | ✓ | ✓ smallest |
| 2. openapi-fetch + Query | ✓ | ✓ typed `error`, middleware | ✓ middleware | ✓ TanStack Query | ✓ inject `fetch` / MSW | ✓ no generated runtime code |
| 3. Full codegen | ✓ | ✓ | ✓ | ✓ if hooks generated | ✓ | ✗ generated code |

## Decision

Use **option 2**: `openapi-typescript` generates `src/api/schema.d.ts` from the OpenAPI spec, `openapi-fetch` is the HTTP client, and `openapi-react-query` on TanStack Query provides caching and loading states in components.

- `createApiClient()` (`src/api/client.ts`) wraps `createClient<paths>` with middleware:
  - `getToken` supplies the bearer token. The token source stays pluggable until #46 is decided.
  - `onUnauthorized` is called on any 401.
- Tests use MSW; no backend is needed.
- Until the backend publishes its spec, `frontend/openapi/openapi.yaml` is a **stub** with one endpoint (`GET /health`). Replace it and run `npm run generate:api`.

## Consequences

- Contract changes surface as TypeScript errors after regenerating `schema.d.ts` (committed, so reviewers see contract changes in the diff).
- Adds runtime dependencies `openapi-fetch`, `@tanstack/react-query`, `openapi-react-query`, and dev dependencies `openapi-typescript`, `msw`.
- **Known risk:** `openapi-typescript@7.13.0` (latest) declares a peer of `typescript ^5`, while the frontend uses TypeScript 6. It is only used as a build-time CLI; generation works, and the peer range is overridden for that package only (`overrides` in `package.json`). Revisit when a release supports TS 6.
- The spec location and the generation step (committed vs. generated in CI) must be aligned with the backend team once the spec exists.
- **Fallback:** if the spec turns out to be unsuitable for `openapi-typescript`, switch to option 3; call sites stay similar.
- Choosing a server-state library is part of this decision. If the team prefers not to adopt TanStack Query yet, `openapi-fetch` works standalone.
