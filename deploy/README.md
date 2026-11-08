# Local development stack

The `taramisu` Compose project includes the backend, Authentik, frontend, proxy, and documentation.
`compose.yaml` is the entry point; the included files describe each component.
Use Docker Compose v2.23.1+ (includes and inline pgAdmin configs), make, OpenSSL, and curl.

## Commands

Run from the repository root:

```sh
make -C deploy init          # Generate missing secrets and validate configuration; no containers
make -C deploy up            # Provision Authentik, start the API, then frontend, docs, and proxy
make -C deploy db            # Start only the backend database
make -C deploy migrate       # Apply backend migrations
make -C deploy pgadmin       # Optional database UI on localhost:5050
make -C deploy migrate-diff name=my_change
make -C deploy down          # Stop the whole stack, preserving data and secrets
make -C deploy check-networks # Check the network segmentation of the running stack
```

The same commands remain available through `make -C backend`. Backend `run`, `test`, `sqlc`, `openapi`, `lint`, and `fmt`
remain backend-specific. Both `down` commands now stop frontend and proxy as well as backend and IAM.

> **Warning:** `make -C deploy reset` (or `make -C backend reset`) deletes all four stack data volumes,
> including Authentik accounts and pgAdmin settings. Use `down` for a normal stop. Reset keeps `iam/.env`.

## Configuration and startup

`dev.sh` generates missing secrets in ignored `iam/.env` with mode 600. Docker must be running so it can first check for existing IAM data.
If an Authentik database volume already exists without `iam/.env`, startup stops instead of generating incompatible credentials.
Restore the matching secrets file before continuing. An existing file is reused and must contain all required values.
It validates the complete Compose configuration before starting any containers. Backend host settings in `backend/.env`
are used by `make run` and `make test`; they are not loaded for container commands.

Startup first verifies a password-authenticated query to the Authentik database, then waits for server and worker health.
It applies the built-in and custom blueprints before starting the API.
The API waits for backend migrations and Authentik health. The script additionally checks `/health/ready`
before starting frontend and proxy.
It validates and reloads nginx so configuration changes and rebuilt API containers take effect on repeat starts.
A provisioning failure stops startup and writes a private `iam/.blueprint.log`, which may contain secrets.

Use `make up` for initial startup and configuration changes. A raw `docker compose up` does not generate secrets
or apply the custom blueprints.
For inspection and service-specific commands, always supply the environment file, the root Compose file and the dev override:

```sh
docker compose --env-file iam/.env -f deploy/compose.yaml -f deploy/compose.dev.yaml ps
docker compose --env-file iam/.env -f deploy/compose.yaml -f deploy/compose.dev.yaml logs api authentik-server authentik-worker
docker compose --env-file iam/.env -f deploy/compose.yaml -f deploy/compose.dev.yaml stop api
```

Current local addresses:

- Frontend: <http://localhost>
- Documentation: <http://localhost/docs/>
- API through the proxy: <http://localhost/api/v1/me> (requires `Authorization: Bearer <JWT>`)
- API Swagger UI: <http://localhost/api/docs> (OpenAPI spec: <http://localhost/openapi.json>)
- Authentik (via proxy): <http://localhost/auth/if/admin/>

`APP_URL` defaults to `http://localhost` and defines the public origin and OIDC callback (`${APP_URL}/auth/callback`).
Authentik runs under `AUTHENTIK_WEB__PATH=/auth/` behind NGINX (`location /auth/`), so the public OIDC issuer is
`${APP_URL}/auth/application/o/taramisu/`, while the Go API fetches JWKS keys internally via
`http://authentik-server:9000/auth/application/o/taramisu/jwks/`.
The NGINX proxy load-balances `/api/v1/` across backend replicas (`least_conn` + runtime DNS resolution), routes `/api/docs` and
`/openapi.json` to the backend's Swagger UI and OpenAPI spec, and routes `/auth/callback` to the frontend SPA.
The API container has no host port binding in Compose, so scaling replicas (`--scale api=N`) works without port collisions.

## Networks and data

The networks follow the network segmentation of the architecture overview (#87). Compose owns every network and prefixes it
with the project name (for example `taramisu_proxy`); no externally created network is required.

| Network | `internal` | Members | Purpose |
| --- | --- | --- | --- |
| `edge` | no | proxy | published ports and internet access |
| `proxy` | yes | proxy, frontend, API, docs, Authentik server | proxy forwards requests (incl. `/auth/` to Authentik); API fetches JWKS from `authentik-server:9000` |
| `app-db` | yes | API, db, migrate, dev-db, pgAdmin | application database |
| `iam-db` | yes | Authentik server, worker, and database | IAM database |
| `dev-app` | no | db, pgAdmin | only from `compose.dev.yaml`, so these services can publish ports locally |
| `dev-iam` | no | Authentik server | only from `compose.dev.yaml`, separate from `dev-app` so Authentik cannot reach the application database |

Two containers can only reach each other if they share a network. The proxy can reach the frontend, the API, docs and Authentik, but no
database; the API cannot reach the Authentik database. Internal networks have no internet access, and containers that are only in
internal networks cannot publish ports. `compose.dev.yaml` therefore adds the `dev-app` and `dev-iam` networks together with the local ports
(db 5432, pgAdmin 5050, Authentik 9000). `dev.sh` and the Makefile always load it; without it only the proxy publishes a port.

For the default project name `taramisu`, volume names preserve the former Authentik branch's data:

- Backend database: `taramisu-backend_postgres_data`
- pgAdmin: `taramisu-backend_pgadmin_data`
- Authentik database: `taramisu-iam_authentik_database`
- Authentik files: `taramisu-iam_authentik_data`

Before the first startup after switching from the two-project layout, stop the old `taramisu-backend` and `taramisu-iam`
projects using their previous Compose files or your container manager. Preserve their volumes and `iam/.env`.
Do not run old and new database containers against the same volume simultaneously. Compose may warn that reused volumes
were created by the former projects; their names and data are intentionally retained.

Other checkouts may have volumes named `backend_postgres_data` or `deploy_postgres_data`; those are not selected automatically.
Check `docker volume ls` and migrate or explicitly override the volume names before using data from those layouts.

`COMPOSE_PROJECT_NAME` (or Docker Compose `-p`) changes both container/network names and the volume prefixes.
Use a separate checkout, secrets file, and free host ports as well when running multiple stacks.

## Checks

```sh
make -C deploy test
make -C backend test
make -C deploy check-networks   # needs the running stack
```

The deployment tests need Python 3 and the Compose CLI, but no running Docker daemon.
They validate the real merged model, networks, volumes, and paths, while stubbing container operations and HTTP requests.
They cover startup ordering, first-run secrets, missing secrets with existing data, repeat starts, Makefile commands, and failure handling.
A live check should also start a fresh stack, verify readiness/login redirects, and restart it to check persistence.
`check-networks` starts a throwaway busybox container in one network at a time and tries to open TCP connections: allowed paths must be
reachable, forbidden paths (for example proxy → database, API → Authentik database, internet from internal networks) must not be.
Forbidden paths use the target's IP address, because Docker's DNS does not resolve service names outside their networks.

## Server (VM) setup and updates

`taramisu-ctl.sh` installs and updates a taramisu release on a Linux host with Docker (ARM64 or x86_64).
Unlike `dev.sh` it uses only `compose.yaml` (no dev ports) and pulls the API, frontend and docs images from GHCR
instead of building them. One release tag `vX.Y.Z` selects both the Git checkout (compose files, nginx config,
Authentik blueprints, migrations) and the three images, so they always fit together.

### Prerequisites

Docker Engine with the Compose plugin ([install docs](https://docs.docker.com/engine/install/)), `git`, `curl` and `openssl`.
The script checks them and does not install anything.

### Host setup (once, as root)

1. Create a `taramisu` user as the only member of the `docker` group, and clone over HTTPS as that user
   (no GitHub account needed):

   ```sh
   useradd --system --create-home --groups docker taramisu
   install -d -o taramisu -g taramisu /opt/taramisu
   sudo -u taramisu git clone https://github.com/thi-taramisu/taramisu.git /opt/taramisu
   ```

2. Allow the people who deploy to run only this script as `taramisu`, not root or a shell:

   ```text
   # /etc/sudoers.d/taramisu (edit with visudo -f)
   %taramisu-admins ALL=(taramisu) NOPASSWD: /opt/taramisu/deploy/taramisu-ctl.sh
   ```

3. Read-only log access for everyone on the VM: set Docker's log driver to journald in `/etc/docker/daemon.json`
   (not in the compose files, because Docker Desktop has no journald) and restart Docker before the first deployment:

   ```json
   { "log-driver": "journald", "log-opts": { "tag": "{{.Name}}" } }
   ```

   Members of the `systemd-journal` group can then read the logs without Docker access or sudo, for example
   `journalctl CONTAINER_NAME=taramisu-api-1 -f`; journald handles rotation. This group can read the whole system journal.

### Usage

```sh
sudo -u taramisu /opt/taramisu/deploy/taramisu-ctl.sh                   # apply the installed release again; fresh clone: newest release
sudo -u taramisu /opt/taramisu/deploy/taramisu-ctl.sh --update          # install the newest release if it is newer
sudo -u taramisu /opt/taramisu/deploy/taramisu-ctl.sh --version v0.3.0  # install a specific release (also rollback)
sudo -u taramisu /opt/taramisu/deploy/taramisu-ctl.sh --prune           # also remove taramisu images no container uses
```

- The script refuses to run as root, because root would own `iam/.env` and Git objects and break the next regular run.
- It fetches the release tags, checks out the selected tag (detached) and continues with the script of that release.
  Releases older than the script cannot be installed with it. Database migrations are not rolled back.
- On the first run it generates `iam/.env` with the same code as `dev.sh` and adds `PROXY_BIND=0.0.0.0`,
  so the proxy accepts connections from outside. Locally the proxy stays on `127.0.0.1`.
- Every run pulls the images, runs pending migrations, recreates changed containers, waits for the health checks
  (up to 10 minutes for Authentik, whose first start migrates its database), checks `/health/ready` through the proxy
  and ends with a table of services, image tags and digests.
- `--prune` removes only `ghcr.io/thi-taramisu/*` images; images of other projects on the host stay.
- The images are public, so no GHCR login is needed. The docs image contains its site URL from the repository variable `DOCS_SITE_URL`.

Two notes on `PROXY_BIND=0.0.0.0`: ports published by Docker bypass UFW (filter in the `DOCKER-USER` chain or in the
provider's firewall), and until HTTPS is in place (#101) the server must not be reachable from the internet.
`PROXY_BIND` in `iam/.env` can also be an internal or VPN address instead.

### Testing without a VM

`deploy/test-bootstrap.sh` runs the script in a throwaway privileged `docker:dind` container: a `taramisu` user in the
`docker` group owns a real clone with all tags plus test releases made from the working tree: `v99.0.0`, `v99.0.1`,
and `v99.0.2` on the same commit as `v99.0.1`. They have no published images, so the test uses the `latest` images.
The first run takes about 10–15 minutes.

```sh
deploy/test-bootstrap.sh       # install the newest test release, ends with the status table
deploy/test-bootstrap.sh sh    # or a shell as taramisu, e.g. to try --version v99.0.0 and --update
```

## Database password mismatch

`POSTGRES_PASSWORD` initializes a new database; changing `PG_PASS` in `iam/.env` does not update a password stored in an existing volume.
The database health check uses a network connection with that password, so a mismatch stops startup before Authentik starts.
A socket-based `pg_isready` check cannot detect this mismatch.

If logs report `password authentication failed for user "authentik"`, restore the matching `iam/.env` or deliberately update the database
role password to the configured value. Keep the other original Authentik secrets as well. For disposable local data, `make -C deploy reset`
removes all stack data volumes; the next `make up` initializes them with the current secrets.

## Documentation service

`compose.docs.yaml` builds from the repository root and publishes only
`docs/external/`. Nginx forwards `/docs/` over the internal `proxy`
network. Neither the docs nor the API container binds a host port; all HTTP traffic enters through the proxy on port 80.

`DOCS_SITE_URL` defaults to `http://localhost`. Set it to the public origin
(e.g. `https://tara.security.science`) when building. The container fixes
`DOCS_BASE_URL=/docs/`. DNS and TLS require separate configuration.

After changing the content or origin, rebuild and reload the proxy:

```sh
docker compose --env-file iam/.env -f deploy/compose.yaml up --build -d docs
docker compose --env-file iam/.env -f deploy/compose.yaml exec proxy nginx -t
docker compose --env-file iam/.env -f deploy/compose.yaml exec proxy nginx -s reload
```

The reload refreshes the docs container address.

## Standalone author preview

With Node.js 24 and npm, no application stack needed:

```sh
cd docs/docusaurus
npm ci
npm start
```

Open <http://localhost:3001> for live preview at `/`.
See the [tooling guide](../docs/docusaurus/README.md) for other build options.
