# Taramisu documentation

| Location | Audience and purpose | Published by Docusaurus? |
| --- | --- | --- |
| `docs/external/` | Users, customers, and consumers of an approved API | Yes |
| `docs/internal/` | Team decisions, development notes, meetings, and work logs | No |
| `docs/docusaurus/` | Docusaurus configuration, tooling, and container image | Tooling, not Markdown content |

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

The documentation is also included in the application stack. With Docker and
Compose installed, run this from the repository root:

```sh
docker compose -f deploy/compose.yaml up --build -d
```

Open <http://localhost/docs/>. This option requires no local Node.js or npm.
See the [deployment guide](../deploy/README.md) for rebuilding documentation
and stopping the stack.

Read the [setup guide](internal/documentation/setup.md) and
[authoring guide](internal/documentation/contributing.md). Existing meeting notes
under `docs/internal/meetings/` stay in place.
