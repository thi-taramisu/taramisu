# Taramisu documentation

| Location | Audience and purpose | Published by Docusaurus? |
| --- | --- | --- |
| `docs/external/` | Users, customers, and consumers of an approved API | Yes |
| `docs/internal/` | Team decisions, development notes, meetings, and work logs | No |
| `docs/docusaurus/` | Docusaurus configuration, tooling, and optional container | Tooling, not Markdown content |

The repository is public. **Internal means team-facing, not confidential.**
Do not commit credentials, private service access details, customer data, or
copyright-restricted standard documents into either area.

## Start the documentation locally

From the repository root, with Node.js 24 and npm installed:

```sh
cd docs/docusaurus
npm ci
npm start
```

Open <http://localhost:3001>. A backend, database, and identity provider are not
required for the documentation site.

Alternatively, with Docker and Compose installed, run this from the repository root:

```sh
docker compose -f docs/docusaurus/compose.yaml up --build -d
```

Open <http://localhost:8080>. This option requires no local Node.js or npm.
After changing documentation, run the command again to rebuild the static preview.

Read the [setup guide](internal/documentation/setup.md) and
[authoring guide](internal/documentation/contributing.md). Existing meeting notes
under `docs/internal/meetings/` stay in place.
