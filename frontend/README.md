# Taramisu frontend

React + TypeScript + Vite, with [shadcn/ui](https://ui.shadcn.com) and Tailwind CSS for UI components, [React Flow](https://reactflow.dev)
(`@xyflow/react`) for diagrams, Vitest for unit/component tests and Playwright for end-to-end tests.

## Commands

```bash
npm ci
npm run dev        # Vite dev server on http://localhost:5173
npm run build      # type check + static production build in dist/
npm run preview    # preview the production build on http://localhost:4173
npm run lint -- --deny-warnings
npm run typecheck  # app, tooling and E2E TypeScript
npm run test:coverage # unit/integration tests, 70% minimum
npm run generate:api  # regenerate src/api/schema.d.ts from ../backend/openapi.json
npm test           # run tests once
npm run test:watch # tests in watch mode
npm run test:e2e   # Playwright against the production preview
```

See the [testing workflow](../docs/internal/dev-workflow/frontend-testing.md) for the coverage policy and test commands.

## Structure

```text
src/
  api/                         # everything the app reads from the backend, real and mocked (see "API client")
  components/ui/               # shadcn/ui components (added via the shadcn CLI, owned by us)
  lib/                         # shared helpers
  pages/                       # route-level components
  features/api-status/         # example: typed GET /health/live on the real backend
  features/workspace/          # project workspace: layout with element tree, "+ New" menu, element pages with tabs, example data
  features/items/              # item pages: create/delete dialogs, tabs
  features/assets/             # item assets tab: table and dialog built with shadcn/ui
  features/project-settings/   # project settings sections
  features/design-system/      # colour scheme data and reusable palette previews
  features/item-definition/    # Item definition diagram (React Flow example, headlamp system)
  test/setup.ts                # jest-dom matchers, browser API mocks for jsdom
  test/renderApp.tsx           # renders the app with a fresh mock item API and query cache
```

All routes from the concept exist, most of them as placeholders. Start at `/projects` and open the hard-coded example project, e.g.
`/projects/headlamp/items/i-01` for the item pages. Items, assets and risks come from the mock item API, so changes last until reload.
The route concept is in [`docs/internal/frontend-routes.md`](../docs/internal/frontend-routes.md).

The workspace `Filetree` takes a project ID and `TreeNode` entries. It uses shadcn/ui disclosure controls, keeps each occurrence of a shared
entity independently expandable, highlights the active entity on its subpages, and preserves URL query parameters (including graph view).
Branches start expanded; navigating to a hidden descendant reveals its ancestors. Use Tab to reach links and disclosure buttons, Enter to
follow links, and Enter/Space to toggle branches. Arrow Up/Down and Home/End move between visible links; Arrow Right expands a branch or
moves to its first child, and Arrow Left collapses it or moves to its parent. Overflowing labels scroll on hover or keyboard focus and reset
on leave; reduced-motion preferences disable the animation.

## API client

The client is typed against the backend's spec `backend/openapi.json`; the reasoning behind the setup is in
[ADR 0001](../docs/internal/adr/0001-frontend-api-client.md). After an API change, regenerate both files and commit them:

```bash
cd backend && make openapi            # backend/openapi.json
cd ../frontend && npm run generate:api  # src/api/schema.d.ts
```

CI regenerates `schema.d.ts` and fails if it differs from the committed file, also when only `backend/openapi.json` changed.

The paths in the spec are complete (`/api/v1/me`, `/health/live`, `/auth/login`): the backend mounts them that way and `proxy/nginx.conf`
forwards the full URI. So the base URL is only the origin: same origin by default, `VITE_API_BASE_URL` for a backend elsewhere. For
`npm run dev`, Vite forwards `/api`, `/auth` and `/health` to `VITE_API_PROXY_TARGET` (default `http://localhost:8080`).

`src/api/` keeps real and mocked data apart:

```text
src/api/
  client.ts, schema.d.ts   # REAL: openapi-fetch client, types generated from backend/openapi.json
  queries/backend.ts       # REAL: hooks on the client (health, current user)
  errors.ts                # ApiError, which every service rejects with
  models/                  # domain types of the views; hand-written until their routes are in the spec
  services/                # service interfaces the views use (e.g. ItemService)
  queries/items.ts         # TanStack Query hooks on the services
  ApiProvider.tsx          # provides the client and the service implementations
  mocks/                   # MOCK: in-memory services and their seed data (mocks/data/)
```

`src/main.tsx` is the only place that decides between real and mock: it passes the real client and the mock item services to
`ApiProvider`. Once a route is in the spec, implement its service on the client (rejecting with `ApiError` and the HTTP status), derive the
model from `components['schemas']` in `schema.d.ts`, and swap it in `main.tsx`. Components never import from `mocks/` except for data
that has no service yet (project list, project settings, example project).

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

## Client rendering and deployment

The frontend is a client-rendered React application. `src/main.tsx` mounts it with `createRoot`, and React Router handles navigation in the
browser. The Filetree, colour previews and existing shadcn controls use this same setup. The item diagram is loaded on demand to keep
React Flow out of the initial bundle.

Build with Node 24 and `npm run build`, then serve the static `dist/` directory. Configure the web server to serve `index.html` for
application routes so direct links and browser refreshes work. Unknown application routes show the React not-found page; the static SPA
fallback can still return HTTP 200. `npm run preview` is for local verification of this build.
