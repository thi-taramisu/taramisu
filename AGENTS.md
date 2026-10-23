# Repository instructions

## Scope and ownership

These shared instructions apply to the whole repository. Read the `AGENTS.md` in the area you change as well.
Contributors maintain this file; each team maintains its own instructions through a reviewed PR.
Update instructions when commands or conventions change. Keep shared rules here instead of copying them into every folder.

## Working conventions

- Read the existing code, relevant issue, and project documentation before editing. Prefer small changes and existing dependencies.
- Work on assigned tickets. Keep PRs focused and explain the problem, resulting behavior, verification, and dependencies.
- Match branch names to the work area, following existing names such as `docs/92-team-agent-instructions` or `feature/30-frontend-routes`.
- Follow the current user's approval requirements for commits, pushes, deployments, and browser tests.
- Review against the PR's actual target branch. Check existing discussions before adding feedback.
- Record technical decisions in the PR, including summaries of decisions made in meetings or Discord.
- Treat draft architecture documents and unmerged PRs as proposals, not as implemented behavior.
- Keep credentials, private access details, customer data, and restricted standards out of this public repository.

## Areas and verification

| Area | Local instructions | Verification |
| --- | --- | --- |
| Backend | [backend/AGENTS.md](backend/AGENTS.md) | `make test`, `make lint`; regenerate affected SQL/OpenAPI outputs |
| Frontend | [frontend/AGENTS.md](frontend/AGENTS.md) | Lint, typecheck, coverage, and production build |
| GitHub Actions | [.github/workflows/AGENTS.md](.github/workflows/AGENTS.md) | Check triggers, paths, permissions, and failure handling |
| Documentation | [docs/AGENTS.md](docs/AGENTS.md) | Markdown lint; Docusaurus checks when published content/tooling changes |

Run commands from the relevant project directory unless documented otherwise.
From the repository root, `npx markdownlint-cli2` uses the shared Markdown rules.
Run checks appropriate to the change; report failures, skipped integration tests, and checks that were not run.
Add focused tests for realistic behavior changes. Do not weaken checks or add assertions solely to raise coverage.
Do not hand-edit generated code or commit build output, installed dependencies, or test reports.

## Other teams

Containerization, IAM/Security, and LLM owners should add scoped instructions alongside their code or configuration as those areas land.
Coordinate ownership for shared folders; do not create empty service folders solely to hold instructions.
Security conventions also apply across the backend, frontend, workflows, and deployment configuration.

## References

- [Repository workflow](docs/internal/dev-workflow/github-setup.md)
- [Meeting decisions](docs/internal/meetings/)
- [Documentation structure](docs/README.md)
