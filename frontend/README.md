# Taramisu frontend

React + TypeScript + Vite, with [shadcn/ui](https://ui.shadcn.com) and Tailwind CSS for UI components, [React Flow](https://reactflow.dev)
(`@xyflow/react`) for diagrams and Vitest for tests.

## Commands

```bash
npm ci
npm run dev        # SSR dev server on http://localhost:5173 (Node 24)
npm run build      # type check + client and server production builds
npm start          # production SSR server on http://localhost:4173
npm run lint -- --deny-warnings
npm run typecheck  # app, tooling and E2E TypeScript
npm run test:coverage # unit/integration tests, 70% minimum
npm run generate:api  # regenerate src/api/schema.d.ts from openapi/openapi.yaml
npm test           # run tests once
npm run test:watch # tests in watch mode
```

## Structure

```text
src/
  api/                         # typed API client (openapi-fetch), generated schema.d.ts
  components/ui/               # shadcn/ui components (added via the shadcn CLI, owned by us)
  lib/                         # shared helpers
  pages/                       # route-level components
  features/api-status/         # example: typed GET /health via openapi-react-query
  features/workspace/          # project workspace: layout with element tree, element pages with tabs, example data
  features/assets/             # item assets tab: table and dialog built with shadcn/ui
  features/design-system/      # colour scheme data and reusable palette previews
  features/item-definition/    # Item definition diagram (React Flow example, headlamp system)
  test/setup.ts                # jest-dom matchers, browser API mocks for jsdom
```

All routes from the concept exist, most of them as placeholders. Start at `/projects` and open the hard-coded example project, e.g.
`/projects/headlamp/items/i-01` for the item definition diagram. The route concept is in
[`docs/internal/frontend-routes.md`](../docs/internal/frontend-routes.md).

The workspace `Filetree` takes a project ID and `TreeNode` entries. It uses shadcn/ui disclosure controls, keeps each occurrence of a shared
entity independently expandable, highlights the active entity on its subpages, and preserves URL query parameters (including graph view).
Branches start expanded; navigating to a hidden descendant reveals its ancestors. Use Tab to reach links and disclosure buttons, Enter to
follow links, and Enter/Space to toggle branches. Arrow Up/Down and Home/End move between visible links; Arrow Right expands a branch or
moves to its first child, and Arrow Left collapses it or moves to its parent. Overflowing labels scroll on hover or keyboard focus and reset
on leave; reduced-motion preferences disable the animation.

## API client

The client is typed against the OpenAPI spec in `openapi/openapi.yaml`, which is only a stub for now. The reasoning behind the setup is in
[ADR 0001](../docs/internal/adr/0001-frontend-api-client.md). The base URL comes from `VITE_API_BASE_URL` and defaults to `/api/v1`.

## UI components

We use [shadcn/ui](https://ui.shadcn.com) (see [ADR 0002](../docs/internal/adr/0002-frontend-ui-library.md)). Add new components with the
CLI, which puts the source into `src/components/ui`:

```bash
npx shadcn@latest add select
```

Import them via the `@/` alias, e.g. `import { Button } from '@/components/ui/button'`. The CSS entry point is `src/index.css`; the Tailwind
v4 configuration, three colour schemes and shared TARA rating tokens are split into `src/styles/`. See the [colour
sheet](src/styles/README.md) and the [palette comparison](http://localhost:5173/design-system/colors). The project list and workspace link
to it; each palette has a dedicated URL for sharing. Reference screenshots: [Filetree](../docs/internal/assets/frontend/filetree.png),
[palette comparison](../docs/internal/assets/frontend/color-schemes.png) and [Ocean detail](../docs/internal/assets/frontend/ocean.png).

## Server rendering

`server.ts` serves the frontend using Node 24. In development it uses Vite middleware and HMR; in production it serves `dist/client` assets
and the renderer in `dist/server`. Set `HOST` and `PORT` to override the loopback address and default ports. For example, `HOST=0.0.0.0
PORT=3000 npm start` exposes the production server inside a container. Deployment must run this Node server rather than serve only static
files.

The shared routes render their initial HTML through `src/entry-server.tsx`. The browser hydrates that same markup in `src/main.tsx`,
preserving client navigation and shadcn interactions. The Filetree, links, headings and palette samples arrive in the HTTP response. Its
disclosure state, keyboard handling and overflow animation run in the browser. React Flow is loaded on demand after hydration because its
diagram uses browser layout APIs; the surrounding workspace still renders on the server.

This is SSR with React hydration, not React Server Components: navigation and interactive controls still require the client bundle. The
palette previews themselves have no browser effects or client state. No framework migration or extra runtime dependency is required. SSR and
hydration are covered by Node/jsdom tests; Playwright requires separate approval.
