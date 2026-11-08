# GitHub Actions instructions

The CI/CD team maintains this file and coordinates component checks with the responsible team.
Shared instructions are in [../../AGENTS.md](../../AGENTS.md).

## References

- Read the workflow being changed, its callers, and the corresponding package scripts or Makefile.
- Use [linting guidance](../../docs/internal/dev-workflow/linting.md),
  [image publishing](../../docs/internal/dev-workflow/docker-publishing.md), and
  [Discord notifications](../../docs/internal/dev-workflow/discord-notifications.md) for those workflows.

## Editing rules

- Extend `lint.yml` and `build.yml` for component validation rather than duplicating their pipelines.
- Preserve stacked-PR support and include workflow changes and shared inputs, such as API contracts, in affected path filters.
- Keep aggregate result checks running and failing on failed change detection, dependency failures, or cancellation;
  allow intentional component skips.
- Use least-privilege permissions and avoid persisted checkout credentials in validation jobs.
- Pass untrusted PR metadata through data/environment variables instead of interpolating it into shell scripts.
  Do not expose secrets or execute untrusted PR code with privileged credentials.
- Preserve relevant concurrency, timeout, lockfile, toolchain, summary, and artifact conventions.
- Coordinate status-check names with maintainers; workflow changes do not configure branch protection.

## Verification

Check effective triggers, path filters, permissions, dependencies, failures, and skips for affected PR, push, and manual-run cases.
Run relevant component checks where practical and distinguish local verification from behavior requiring an actual Actions run.
