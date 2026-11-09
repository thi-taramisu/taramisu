# Documentation instructions

The Documentation team maintains this file; other teams document and review their own areas.
Shared instructions are in [../AGENTS.md](../AGENTS.md).

## References

- [README.md](README.md): audiences, publication boundaries, and local preview.
- [Docusaurus README](docusaurus/README.md): tooling, build commands, and deployment settings.
- [Linting guide](internal/dev-workflow/linting.md): shared Markdown rules and commands.

## Editing rules

- Follow the README's content split. Only `external/` is published; internal content must not become a Docusaurus source.
- Write concise English Markdown and check relative links and referenced assets; Markdown lint does not validate their existence.
- Keep meeting records distinct from current implementation status. Mark proposals, prototypes, and unverified interpretations as such.
- For documents relevant to the whole team, follow the
  [agreed review window](internal/meetings/onsite-2026-10-06.md#4-documentation-strategy): at least 24 hours or everyone's approval.

## Verification

Run Markdown lint for Markdown changes. Use the Docusaurus README's typecheck and build commands when published content or
site tooling changes; internal Markdown-only changes do not need a site build.
