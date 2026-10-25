# Deployment

Requires Docker Compose v2.23.1+. From the repository root:

```sh
docker compose -f deploy/compose.yaml up --build -d
docker compose -f deploy/compose.yaml ps
```

This starts the backend, frontend, proxy, and documentation:

- App: <http://localhost>
- Docs: <http://localhost/docs/>

Stop with `docker compose -f deploy/compose.yaml down`; database volumes are preserved.

## Documentation service

`compose.docs.yaml` builds from the repository root and publishes only
`docs/external/`. Nginx forwards `/docs/` over the Compose-managed `taramisu-proxy`
network. Docs has no host port binding; port 8080 belongs to the backend.

`DOCS_SITE_URL` defaults to `http://localhost`. Set it to the public origin
(e.g. `https://tara.security.science`) when building. The container fixes
`DOCS_BASE_URL=/docs/`. DNS and TLS require separate configuration.

After changing the content or origin, rebuild and reload the proxy:

```sh
docker compose -f deploy/compose.yaml up --build -d docs
docker compose -f deploy/compose.yaml exec proxy nginx -t
docker compose -f deploy/compose.yaml exec proxy nginx -s reload
```

The reload refreshes the docs container address. On first setup, run the
full-stack command above so the proxy joins the docs network.

## Standalone author preview

With Node.js 24 and npm, no application stack needed:

```sh
cd docs/docusaurus
npm ci
npm start
```

Open <http://localhost:3001> for live preview at `/`.
See the [tooling guide](../docs/docusaurus/README.md) for other build options.
