# Taramisu frontend

React + TypeScript + Vite, with [React Flow](https://reactflow.dev) (`@xyflow/react`) for diagrams,
Vitest for unit/component tests, and Playwright for end-to-end tests.

## Commands

```bash
npm install
npm run dev           # dev server on http://localhost:5173
npm run typecheck     # strict TypeScript check (tsc -b)
npm run build         # type check + production build
npm run lint          # oxlint
npm run generate:api  # regenerate src/api/schema.d.ts from openapi/openapi.yaml
npm test              # run unit/component tests once
npm run test:coverage # run unit/component tests with enforced V8 coverage thresholds
npm run test:watch    # tests in watch mode
npm run test:e2e      # run Playwright E2E tests against production preview
```

## Structure

```text
e2e/                           # Playwright end-to-end tests
src/
  api/                         # typed API client (openapi-fetch), generated schema.d.ts
  pages/                       # route-level components
  features/api-status/         # example: typed GET /health via openapi-react-query
  features/item-definition/    # Item definition diagram (React Flow example, headlamp system)
  test/setup.ts                # jest-dom matchers, browser API mocks for jsdom
```

The only page so far is `/item-definition`, an example with hard-coded data. The route concept is in
[`docs/internal/frontend-routes.md`](../docs/internal/frontend-routes.md).

## API client

The client is typed against the OpenAPI spec in `openapi/openapi.yaml`, which is only a stub for now. The reasoning behind the setup is in
[ADR 0001](../docs/internal/adr/0001-frontend-api-client.md). The base URL comes from `VITE_API_BASE_URL` and defaults to `/api/v1`.
