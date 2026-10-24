# GitHub Actions instructions

## Scope and ownership

The CI/CD team maintains these instructions and coordinates component checks with the responsible team.
Shared rules are in [../../AGENTS.md](../../AGENTS.md).
Read the workflow being changed, its callers, and the corresponding package scripts or Makefile first.

## Conventions

- Extend the central `lint.yml` and `build.yml` jobs when appropriate; avoid adding duplicate component pipelines.
  Backend consolidation is tracked by PRs #74 and #122; inspect the actual branch before changing those workflows.
- Keep PR triggers compatible with stacked PRs. Apply path filters to component jobs and keep aggregate result jobs running.
- Include workflow/configuration changes in the relevant path filters. Check shared inputs such as API contracts as well.
- Keep aggregate result checks failing on dependency failures, cancellation, or failed change detection; allow intentional component skips.
- Declare the least permissions each job needs. Avoid persisted checkout credentials in validation jobs.
- Follow existing concurrency, timeout, lockfile installation, toolchain version, summary, and artifact conventions.
- Do not put untrusted PR titles, bodies, or branch names directly into shell expressions. Pass them through data/environment variables.
- Never expose secrets in output or run untrusted PR code with privileged credentials.

## Verification and review

- Inspect the effective triggers, paths, job dependencies, and permissions, including the `push`, PR, and manual-run cases in use.
- Check frontend-only, backend-only, docs-only, workflow-only, failure, and skipped-job behavior for changes to central gates.
- Run the affected component commands locally where practical and report differences from the GitHub runner environment.
- For Markdown changes, run `npx markdownlint-cli2` from the repository root.
- Report which behavior was checked locally and which still requires an actual Actions run; do not claim an unrun workflow passed.
- Coordinate required status check names with repository maintainers. Changing a workflow does not configure branch protection.

## Team maintenance

Update these instructions when workflow consolidation or shared validation commands change.
Keep component-specific test policy in the component's instructions rather than duplicating it here.
