# Taramisu documentation site

Docusaurus tooling lives here; the published Markdown source lives in
[`../docs/external`](../docs/external/). Internal documents are not registered as
a content source. This is a separate npm project from the application frontend.

## Local use

Use Node.js **24.x** with npm. The major is selected in `.nvmrc`, `package.json`,
the GitHub workflow, and the optional Dockerfile. Install an available security
patch release within this major. Docusaurus itself requires Node.js 20 or newer;
the Node.js 24 choice is a baseline for this scaffold, not a meeting decision.

```sh
# From this directory:
npm ci
npm start
```

Open <http://localhost:3001>. Stop the process with Ctrl+C.

```sh
npm run typecheck
npm run build
npm run serve
```

`serve` previews the production output on port 3001. Stop the development server
first, or run `npm run serve -- --port 3002`. Static output is in `build/`.
Commit `package-lock.json`; generated output and installed modules are ignored.

## Build-time configuration

| Environment variable | Default | Meaning |
| --- | --- | --- |
| `DOCS_SITE_URL` | `http://localhost:3001` | Origin only, e.g. `https://docs.example.org` |
| `DOCS_BASE_URL` | `/` | Public path, e.g. `/docs/`; starts and ends with `/` |
| `DOCS_REPOSITORY_URL` | Unset | Verified full GitHub repository URL for repository/edit links |

These settings are public metadata and must not contain secrets. The npm commands
read your shell environment; they do **not** automatically load a `.env` file.
The GitHub workflow derives the repository URL from the actual repository and
accepts the other two settings as optional repository variables.

**PowerShell**, from `docs-site`:

```powershell
$env:DOCS_SITE_URL = "https://docs.example.org"
$env:DOCS_BASE_URL = "/"
npm run build
# Reset when returning to the default local configuration:
Remove-Item Env:DOCS_SITE_URL, Env:DOCS_BASE_URL -ErrorAction SilentlyContinue
```

**Bash**, from `docs-site`:

```sh
DOCS_SITE_URL=https://docs.example.org DOCS_BASE_URL=/ npm run build
```

The example domain is a placeholder. A changed origin or path requires a rebuild.
For a subpath build, the web server must mount the output at the same public
subpath. The initial Docker example below supports root hosting (`/`) only.

## Optional Docker preview

Requires Docker with Compose. From the **repository root**:

```sh
docker compose -f docs-site/compose.yaml up --build -d
docker compose -f docs-site/compose.yaml ps
```

Open <http://localhost:8080> and <http://localhost:8080/healthz>.
The port is bound to the local host. This is a standalone preview, not the team's
application Compose bundle or a public deployment.

```sh
docker compose -f docs-site/compose.yaml down
```

The build context is the repository root because `docs/external` sits outside
this directory. `Dockerfile.dockerignore` limits the context; the Dockerfile
copies only external content. The runtime image contains Nginx and static files.
Moving to a public domain, configuring TLS/proxy routing, and integrating this
service into the shared Compose bundle belong to the infrastructure hand-off.
Image tags select a release line and may change; pin reviewed digests later if
the team requires bit-for-bit container reproducibility.


