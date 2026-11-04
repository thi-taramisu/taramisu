# Frontend instructions

The Frontend team maintains this file. Shared instructions are in [../AGENTS.md](../AGENTS.md).

## References

- [README.md](README.md): commands, structure, API integration, shadcn/ui, and client rendering.
- [Testing guidelines](../docs/internal/dev-workflow/frontend-testing.md): test strategy and coverage policy.
- [Colour sheet](src/styles/README.md): Tailwind configuration, palettes, semantic tokens, and accessibility.
- [Route documentation](../docs/internal/frontend-routes.md): navigation and entity relationships.

## Editing rules

- Use `.tsx` for React components and `.ts` for non-JSX modules. Extend the existing `pages/`, `features/`, and `api/` structure.
- Keep the Vite client-rendered application and React Router navigation. Reuse route helpers and shared components.
- Keep components focused; split files over 400 lines and extract repeated patterns.
- Use the existing Tailwind/shadcn setup and semantic colour tokens; follow the colour sheet when changing styles.
- Use semantic HTML, accessible names, keyboard controls, visible focus, and clear loading/error states.
- Follow the README's API workflow: generate types from `backend/openapi.json` and preserve the documented real/mock boundary.
- Update route documentation and affected tests when navigation changes.

## Verification

Use the README's lint, typecheck, coverage, and build commands and the testing guidelines for focused regression tests.
Obtain the current user's approval before running Playwright. Keep E2E routes aligned with application behavior.
