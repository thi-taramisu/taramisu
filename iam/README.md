# Local Authentik

Requires Docker Compose v2.20+, make, OpenSSL and curl. Ports 5432, 8080 and 9000
must be free. From the repository root:

```sh
make -C backend up
make -C backend down
```

Startup provisions Authentik, runs backend migrations and waits for readiness.
It generates secrets in ignored `iam/.env` on first run. If copying
[`.env.example`](.env.example) manually, fill all five blank values
(`openssl rand -hex 32` for each). Keep `.env` with the database volumes;
`make down` preserves both. This stack uses the `taramisu-iam` Compose project.

- Admin: <http://authentik.localhost:9000>, user `akadmin`, password `AUTHENTIK_BOOTSTRAP_PASSWORD`.
- Login: <http://localhost:8080/auth/login>, user `dev`, password `DEV_PASSWORD`.

Passwords are in `iam/.env`. Startup reapplies the blueprint; the admin bootstrap
password only takes effect on a fresh database. `APP_URL` must be an origin
without a trailing slash and determines the callback URL.

Login returns `/api/v1/me` with the local user ID, issuer and subject.
`POST /auth/logout` ends the backend session and requires `Origin` to match `APP_URL`.
Sessions last eight hours and are lost on API restart. Logout leaves the Authentik
SSO session active. Group synchronization and project permissions are not implemented.

## Checks

```sh
curl -f http://localhost:8080/health/ready
sh backend/dev_test.sh
make -C backend test
TEST_DATABASE_URL='postgres://taramisu:taramisu@localhost:5432/taramisu?sslmode=disable' make -C backend test
```

Database tests need the running stack; they are skipped without `TEST_DATABASE_URL`.
Provisioning failures are saved to ignored `iam/.blueprint.log`, which may contain
secrets. For backend logs:

```sh
docker compose --env-file iam/.env -f iam/compose.yaml logs api
```
