# Taramisu

Taramisu is an automated Threat Analysis and Risk Assessment (TARA) platform for automotive cybersecurity
engineering in accordance with **ISO/SAE 21434:2021**.

---

## Repository Structure

```text
taramisu/
├── .github/          # GitHub Actions workflows (lint.yml, build.yml) and issue/PR templates
├── backend/          # Go backend service (Chi, Huma, Atlas migrations, SQLC)
├── docs/             # Documentation
│   └── internal/     # Architecture decisions, dev workflow guides, meeting notes
└── frontend/         # React + Vite frontend with React Flow diagramming and Vitest
```

---

## Development & Quality Gates

### Markdown Linting

All Markdown documentation is validated automatically in CI using `markdownlint-cli2`. You can run the linter
locally before pushing commits:

```bash
# Check all Markdown files
npx markdownlint-cli2

# Automatically fix whitespace, indentation, and formatting issues
npx markdownlint-cli2 --fix
```

For VS Code integration, rule details, and customization options, see the
[Markdown Linting Guide](docs/internal/dev-workflow/linting.md).

### Component Workflows

* **Frontend:** See [frontend/README.md](frontend/README.md) for local dev server, testing, and linting (`oxlint`).
* **Backend:** See [backend/README.md](backend/README.md) for local setup, Docker Compose, migrations, and tests.
* **Governance & Branch Protection:** See [docs/internal/dev-workflow/github-setup.md](docs/internal/dev-workflow/github-setup.md).
