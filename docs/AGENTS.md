# Documentation instructions

## Scope and ownership

The Documentation team maintains these instructions; other teams document their own work and review content in their area.
Shared rules are in [../AGENTS.md](../AGENTS.md). Read [README.md](README.md) for the content split.

## Conventions and generated files

- Put user/customer guidance in `external/` and team-facing meetings, decisions, and development guides in `internal/`.
- Docusaurus publishes only `external/`. Do not add internal documents as a content source.
- Write concise English Markdown with working relative links. Use the shared root Markdown configuration.
- Keep historical meeting notes distinct from current implementation status; use follow-up issues and PRs for later changes.
- Describe draft decisions and prototypes as such. Do not turn an interpretation of a standard into a verified requirement without a source.
- Never publish secrets, private access details, customer data, or restricted standard text. This repository is public.
- Keep Docusaurus output (`docusaurus/build/`, `.docusaurus/`) and dependencies out of commits.
- For documents relevant to the whole team, allow at least 24 hours for PR review or obtain everyone's approval before merging,
  as recorded in the 2026-10-06 meeting.

## Setup and verification

From the repository root, run `npx markdownlint-cli2` for Markdown changes.
Check relative links and referenced assets; Markdown lint does not validate their existence.
For changes to published content or Docusaurus tooling, use Node.js 24 and run from `docs/docusaurus/`:

```sh
npm ci
npm run typecheck
npm run build
```

The production build checks configured documentation links and anchors. `npm start` provides a local preview on port 3001.
Internal Markdown-only changes do not require a Docusaurus build.
The documentation site is a separate npm project; keep its dependency installation and configuration separate from `frontend/`.

## Team maintenance

Keep setup commands aligned with `docusaurus/package.json` and the documentation workflow.
Add narrower instructions only when a documentation area needs additional conventions.
