# Taramisu frontend

React + TypeScript + Vite, with [React Flow](https://reactflow.dev) (`@xyflow/react`) for diagrams and Vitest for tests.

## Commands

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # type check + production build
npm run lint       # oxlint
npm run generate:api  # regenerate src/api/schema.d.ts from openapi/openapi.yaml
npm test           # run tests once
npm run test:watch # tests in watch mode
```

## Structure

```
src/
  api/                         # typed API client (openapi-fetch), generated schema.d.ts
  pages/                       # route-level components
  features/api-status/         # example: typed GET /health via openapi-react-query
  features/item-definition/    # Item definition diagram (React Flow example, headlamp system)
  test/setup.ts                # jest-dom matchers, browser API mocks for jsdom
```

The only page so far is `/item-definition`, an example with hard-coded data. The route concept is in [`docs/internal/frontend-routes.md`](../docs/internal/frontend-routes.md).

## API client

Typed against the OpenAPI spec (`openapi/openapi.yaml`, currently a stub). See [ADR 0001](../docs/internal/adr/0001-frontend-api-client.md). Base URL: `VITE_API_BASE_URL` (default `/api/v1`).
