# ADR 0002: Frontend UI component library

- Status: Accepted, agreed with the frontend team
- Issue: #32
- Related: #6 (wireframes), #30 (routes), #31 (API client, [ADR 0001](0001-frontend-api-client.md))

## Context

The frontend (React 19, TypeScript, Vite, React Router, `@xyflow/react`) has no shared UI components yet. The TARA pages from the [route concept](../frontend-routes.md) are mostly tables, forms, dialogs and navigation, so we want one component library that everyone builds on, instead of everyone styling their own buttons.

What we want from the library:

| # | Requirement |
|---|-------------|
| R1 | Accessible out of the box (keyboard, focus handling, ARIA) |
| R2 | Good TypeScript support |
| R3 | Theming, so we can adapt colours and spacing to our own design |
| R4 | Has the components we need: table, form inputs, dialog, navigation/sidebar |
| R5 | Works with React 19 and doesn't get in the way of `@xyflow/react` |
| R6 | Permissive license (MIT or similar) |
| R7 | Reasonable bundle size |

## Options

1. **shadcn/ui** (Radix primitives + Tailwind CSS). Not a dependency in the usual sense: the CLI copies the component source into `src/components/ui`, and we own and can change that code. The behaviour and accessibility come from Radix.
2. **MUI (Material UI).** Very complete, including a data grid, but it looks like Material Design unless you put in a lot of theming work, and it brings its own styling engine (Emotion).
3. **Mantine.** Complete and well documented, with its own form and hook libraries. Styled through its own CSS modules and theme object.

| | R1 a11y | R2 TS | R3 theming | R4 components | R5 React 19 / xyflow | R6 license | R7 size |
|---|---|---|---|---|---|---|---|
| 1. shadcn/ui | ✓ Radix | ✓ | ✓ CSS variables, code is ours | ✓ (data table via TanStack Table) | ✓ | MIT | ✓ only what we add |
| 2. MUI | ✓ | ✓ | ~ possible, but Material look | ✓ incl. data grid | ✓ | MIT (data grid pro is paid) | ✗ largest |
| 3. Mantine | ✓ | ✓ | ✓ theme object | ✓ | ✓ | MIT | ~ |

## Decision

We use **shadcn/ui** with the Radix base and the default "Nova" style. The frontend team already has experience with it, we like how the components look, and because the component code lives in our repo we can change anything we need to.

The setup in `frontend/`:

- Tailwind CSS v4 via `@tailwindcss/vite`. The theme (colours, radius, font) is defined as CSS variables in `src/index.css`.
- `components.json` holds the shadcn configuration, so `npx shadcn@latest add <component>` puts new components into `src/components/ui`.
- The `@/` import alias points to `src/` (in `tsconfig*.json` and `vite.config.ts`).
- The assets tab of an item (`/projects/headlamp/items/i-01/assets`, first added as `/assets` and moved there in #30) is a small example using table, badge, dialog, input and label.

## Consequences

- Styling is done with Tailwind utility classes. The existing inline styles (e.g. on the item definition page) can be moved over step by step.
- The files in `src/components/ui` are generated, but they belong to us. Updating them means re-running `shadcn add` and checking the diff, there is no `npm update` for them. Small local changes are fine, bigger ones should go into a wrapper component.
- oxlint warns about `only-export-components` in the generated `button.tsx` and `badge.tsx`, because they also export their variants. This only affects fast refresh for those two files and we leave it as generated.
- New runtime dependencies: `radix-ui`, `class-variance-authority`, `cn`, `lucide-react` (icons), `tw-animate-css`, `@fontsource-variable/geist`, `shadcn` (for its base CSS). New dev dependencies: `tailwindcss`, `@tailwindcss/vite`.
- For larger tables (sorting, filtering, paging) we'll add TanStack Table, which is what the shadcn data table example builds on. It fits with TanStack Query from ADR 0001.
- React Flow keeps its own styling. Custom nodes can use Tailwind classes and shadcn components inside them.
