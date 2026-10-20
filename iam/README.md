# Local Authentik

Authentik is started and provisioned by [`backend/dev.sh`](../backend/dev.sh).
See the [backend README](../backend/README.md) for startup, login and checks.
It runs as the `taramisu-iam` Compose project, separate from `taramisu-backend`.
IAM owns the `taramisu-auth` network connecting its server to the backend API.
From this directory, `docker compose logs server worker` shows the IAM logs.

Startup generates secrets in ignored `iam/.env` on first run. If copying
[`.env.example`](.env.example) manually, fill all five blank values
(`openssl rand -hex 32` for each). Keep `.env` with the database volumes;
`make down` preserves both.

- Admin: <http://authentik.localhost:9000>, user `akadmin`, password `AUTHENTIK_BOOTSTRAP_PASSWORD`.

Passwords are in `iam/.env`. Startup reapplies the blueprints; the admin bootstrap
password only takes effect on a fresh database.
Provisioning failures are saved to ignored `iam/.blueprint.log`, which may contain
secrets.
