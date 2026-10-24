# Frontend instructions

## Scope and ownership

The Frontend team maintains these instructions. Shared rules are in [../AGENTS.md](../AGENTS.md).
This is a React/TypeScript application using Vite, React Router, React Flow, TanStack Query, and Vitest.
Use React Router for internal navigation and follow the existing Vite build patterns.

## Conventions and generated files

- Use `.tsx` for React components and `.ts` for non-JSX modules. Follow the existing `pages/`, `features/`, and `api/` structure.
- Reuse route helpers and shared components when available on the branch. Keep components focused; split files over 400 lines.
- Use Tailwind CSS for new UI. Its initial setup and shadcn/ui components are in PR #113; build on that work instead of adding a second setup.
- Use semantic HTML, accessible names, keyboard controls, visible focus, and clear loading/error states.
- Keep React Flow's styling intact. Test graph data and surrounding UI separately from browser layout.
- Generate `src/api/schema.d.ts` using `npm run generate:api`; do not edit it by hand.
  The current source is `openapi/openapi.yaml`. Issue #118 tracks switching to the backend contract.
- Update route documentation and affected tests when navigation changes. Respect the actual base of stacked frontend PRs.

## Setup and verification

Use Node.js 24, selected by `.nvmrc`, and run these commands from `frontend/`:

```sh
npm ci
npm run dev
npm run lint -- --deny-warnings
npm run typecheck
npm run test:coverage
npm run build
```

`npm test` runs unit/component tests without coverage. Current global coverage thresholds are 70% for all four metrics.
Test user-visible behavior with accessible queries and realistic interactions; mock requests at the HTTP/client boundary.
Playwright (`npm run test:e2e`) checks real browser behavior against the production preview; follow the user's approval requirements.
Keep E2E routes and expectations aligned with the application when routes change.

## References and team maintenance

- [Testing guidelines](../docs/internal/dev-workflow/frontend-testing.md)
- [Route documentation](../docs/internal/frontend-routes.md)

Update this file when #113 or #118 lands so that setup and generated-file guidance describes the integrated implementation.
