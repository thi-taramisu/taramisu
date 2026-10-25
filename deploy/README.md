# Local development stack

The `taramisu` Compose project includes the backend, Authentik, frontend, and proxy.
`compose.yaml` is the entry point; the included files describe each component.
Use Docker Compose v2.23.1+ (includes and inline pgAdmin configs), make, OpenSSL, and curl.

## Commands

Run from the repository root:

```sh
make -C deploy init          # Generate missing secrets and validate configuration; no containers
make -C deploy up            # Provision Authentik, start the API, then frontend and proxy
make -C deploy db            # Start only the backend database
make -C deploy migrate       # Apply backend migrations
make -C deploy pgadmin       # Optional database UI on localhost:5050
make -C deploy migrate-diff name=my_change
make -C deploy down          # Stop the whole stack, preserving data and secrets
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
A provisioning failure stops startup and writes a private `iam/.blueprint.log`, which may contain secrets.

Use `make up` for initial startup and configuration changes. A raw `docker compose up` does not generate secrets
or apply the custom blueprints.
For inspection and service-specific commands, always supply the environment file and root Compose file:

```sh
docker compose --env-file iam/.env -f deploy/compose.yaml ps
docker compose --env-file iam/.env -f deploy/compose.yaml logs api authentik-server authentik-worker
docker compose --env-file iam/.env -f deploy/compose.yaml stop api
```

Current local addresses:

- Frontend: <http://localhost>
- API and Swagger: <http://localhost:8080/docs>
- Login: <http://localhost:8080/auth/login>
- Authentik: <http://authentik.localhost:9000>

`APP_URL` defaults to `http://localhost:8080` and defines the callback and logout origin.
The issuer remains `http://authentik.localhost:9000/application/o/taramisu/`, reachable from the browser and API container.
The proxy's existing API-prefix rewrite and missing `/auth/` route still need the separate routing change;
use port 8080 for authentication until that change is in place.

## Networks and data

The frontend, proxy, and API share the default application network. Backend database, migrations, and pgAdmin use `backend`.
Authentik server, worker, and database use `iam`. Only the API and Authentik server join `auth`, where the server has
alias `authentik.localhost`. Compose owns every network; no externally created network is required.

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
```

The deployment tests need Python 3 and the Compose CLI, but no running Docker daemon.
They validate the real merged model, networks, volumes, and paths, while stubbing container operations and HTTP requests.
They cover startup ordering, first-run secrets, missing secrets with existing data, repeat starts, Makefile commands, and failure handling.
A live check should also start a fresh stack, verify readiness/login redirects, and restart it to check persistence.

## Database password mismatch

`POSTGRES_PASSWORD` initializes a new database; changing `PG_PASS` in `iam/.env` does not update a password stored in an existing volume.
The database health check uses a network connection with that password, so a mismatch stops startup before Authentik starts.
A socket-based `pg_isready` check cannot detect this mismatch.

If logs report `password authentication failed for user "authentik"`, restore the matching `iam/.env` or deliberately update the database
role password to the configured value. Keep the other original Authentik secrets as well. For disposable local data, `make -C deploy reset`
removes all stack data volumes; the next `make up` initializes them with the current secrets.
