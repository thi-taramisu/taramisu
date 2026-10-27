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
npm run generate:api  # regenerate src/api/schema.d.ts from openapi/openapi.yaml
npm test           # run tests once
npm run test:watch # tests in watch mode
npm run test:e2e   # Playwright against the production preview
```

See the [testing workflow](../docs/internal/dev-workflow/frontend-testing.md) for the coverage policy and test commands.

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

## Sentry

Copy `.env.example` to `.env.local` and set `VITE_SENTRY_DSN` from the `taramisu-frontend` project in the
`thi-nf` organization. Sentry captures browser exceptions, unhandled rejections, and React render errors.
An empty DSN disables reporting. Set `VITE_SENTRY_ENVIRONMENT` and optionally `VITE_SENTRY_RELEASE`
to identify deployments. Vite embeds these values at build time; configure them before building and rebuild
after changes. Never put a Sentry auth token in a `VITE_` variable.

Docker builds accept these settings as build arguments. To build with Compose using your frontend
environment file, run this from the repository root:

```bash
docker compose --env-file frontend/.env.local -f deploy/compose.frontend.yaml build frontend
```

Compose also accepts `VITE_SENTRY_*` values exported in your shell. Container runtime variables do not
change the compiled frontend; rebuild the image after changing these settings.

Source map upload is not configured yet; production stack traces may reference bundled code.

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
