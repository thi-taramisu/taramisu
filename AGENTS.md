# Repository instructions

These instructions apply across the repository; also read the scoped `AGENTS.md` for the area you change.
Contributors maintain this file, and each team maintains its scoped instructions through reviewed PRs.

## Start here

Setup, commands, and architecture belong in the existing documentation. Link to that documentation instead of copying it here.

| Area | Instructions | Setup and reference |
| --- | --- | --- |
| Backend | [backend/AGENTS.md](backend/AGENTS.md) | [Backend README](backend/README.md) |
| Frontend | [frontend/AGENTS.md](frontend/AGENTS.md) | [Frontend README](frontend/README.md) |
| GitHub Actions | [.github/workflows/AGENTS.md](.github/workflows/AGENTS.md) | [Repository workflow](docs/internal/dev-workflow/github-setup.md) |
| Documentation | [docs/AGENTS.md](docs/AGENTS.md) | [Documentation README](docs/README.md) |
| Deployment and IAM | Maintained by the responsible teams | [Deployment README](deploy/README.md), [IAM README](iam/README.md) |

## Working rules

- Read the assigned issue, relevant code, and existing documentation before editing. Prefer small changes and existing dependencies.
- Follow the [repository workflow](docs/internal/dev-workflow/github-setup.md) and [PR template](.github/pull_request_template.md).
- Review against the PR's actual target branch and read existing discussions before adding feedback.
- Record technical decisions in the PR, including decisions made in meetings or Discord.
- Check the implementation on the branch being changed; unmerged PRs and draft designs are proposals.
- Follow the current user's approval requirements for commits, pushes, deployments, and browser tests.

## Verification and maintenance

Use the relevant README and CI workflow for verification commands. Run checks appropriate to the change and report failures or skips.
Test realistic behavior; do not weaken checks or add assertions solely to raise coverage. Regenerate derived files from their sources.
Keep build output, dependencies, and reports out of commits; follow the [public-repository data rules](docs/README.md).

Update instructions alongside changes that affect them. Add narrower instructions only for rules missing from shared guidance;
do not create empty service folders or copy READMEs into `AGENTS.md`.
