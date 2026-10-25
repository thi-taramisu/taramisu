# Local Authentik

Authentik is part of the `taramisu` Compose project, configured in
[`deploy/compose.iam.yaml`](../deploy/compose.iam.yaml). Its blueprints and branding stay in this directory.
[`deploy/dev.sh`](../deploy/dev.sh) starts and provisions it before starting the API.
See the [deployment README](../deploy/README.md) for startup, migration, networking, and data volumes.

From the repository root:

```sh
make -C deploy up
docker compose --env-file iam/.env -f deploy/compose.yaml logs authentik-server authentik-worker
```

Startup generates secrets in ignored `iam/.env` on first run. `make -C deploy init` does this without starting containers.
Docker must be running to check for existing data. If the database already exists but `.env` is missing, restore the matching file;
startup will not generate replacement secrets for an existing database.
If copying [`.env.example`](.env.example) manually, fill all five blank values (`openssl rand -hex 32` for each).
Keep `.env` with the database volumes; `make -C deploy down` preserves both.

- Admin: <http://authentik.localhost:9000>, user `akadmin`, password `AUTHENTIK_BOOTSTRAP_PASSWORD`.
- Application login: <http://localhost:8080/auth/login>, user `dev`, password `DEV_PASSWORD`.

Passwords are in `iam/.env`. Startup reapplies the blueprints; the admin bootstrap
password only takes effect on a fresh database.
Provisioning failures are saved to ignored `iam/.blueprint.log`, which may contain secrets.

Only the Authentik server and backend API share the `auth` network. The Authentik database and worker use the separate `iam` network.
