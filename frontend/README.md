# Taramisu frontend

React + TypeScript + Vite, with [React Flow](https://reactflow.dev) (`@xyflow/react`) for diagrams and Vitest for tests.

## Commands

```bash
npm install
npm run dev        # dev server on http://localhost:5173
npm run build      # type check + production build
npm run lint       # oxlint
npm test           # run tests once
npm run test:watch # tests in watch mode
```

## Structure

```
src/
  pages/                       # route-level components
  features/item-definition/    # Item definition diagram (React Flow example, headlamp system)
  test/setup.ts                # jest-dom matchers, browser API mocks for jsdom
```

The only page so far is `/item-definition`, an example with hard-coded data. The route concept is in [`docs/internal/frontend-routes.md`](../docs/internal/frontend-routes.md).
