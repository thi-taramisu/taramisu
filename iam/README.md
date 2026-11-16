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
Older `.env` files without `AUTHENTIK_API_TOKEN` get a generated token on the next startup; other values are not changed.
Keep `.env` with the database volumes; `make -C deploy down` preserves both.

- Admin UI: <http://localhost/auth/if/admin/>, user `akadmin`, password `AUTHENTIK_BOOTSTRAP_PASSWORD`.
- Application: <http://localhost>, user `dev`, password `DEV_PASSWORD`.

Authentik runs under `/auth/` behind the NGINX reverse proxy (`AUTHENTIK_WEB__PATH=/auth/`).
The `Taramisu` OAuth2 provider is configured as a public client (`Authorization Code + PKCE`) issuing JWT access tokens with `sub=hashed_user_id`,
`name`, and `email` claims. The Go backend validates incoming `Bearer` JWTs statelessly against Authentik's JWKS endpoint over the internal
Docker network without holding any session state or client secret.

Use `APP_URL=http://localhost` in `iam/.env` for the Compose stack. After changing it, run `make -C deploy up`
to update both the OIDC issuer and the Authentik callback URL. Preserve all existing secrets.

Passwords are in `iam/.env`. Startup reapplies the blueprints; the admin bootstrap
password only takes effect on a fresh database.
Provisioning failures are saved to ignored `iam/.blueprint.log`, which may contain secrets.

The Authentik server is reachable by NGINX over `taramisu-proxy` and by the backend API over `auth`.
The Authentik database and worker use the separate `iam` network.

## Project roles: groups and API access

Project roles are specified in the [project roles document](../docs/internal/architecture/iam/project-roles.md).
The `taramisu.yaml` blueprint provides two things for them:

- **Group claim:** the scope mapping `Taramisu: assignable groups` adds `taramisu_groups` (UUIDs of the user's groups with the
  attribute `taramisu_assignable: true`) to the token. To make a group assignable to projects, open **Directory → Groups**, edit
  the group, and set `taramisu_assignable: true` under **Attributes**. Only direct memberships count. Membership changes apply
  with the next access token (at most 10 minutes).
- **Directory access for the API:** the service account `taramisu-api` with the role `taramisu-directory-reader` (view users
  and groups only) and the API token `AUTHENTIK_API_TOKEN` from `iam/.env`. The API uses it to find members by email and to
  show member and group names.

## Registration and approval

Use **Sign up** on the login screen to register. Accounts remain inactive until an
administrator enables **Active** under **Directory → Users** in Authentik.
Approved users can sign in at <http://localhost> (or <http://localhost/auth/if/flow/default-authentication-flow/>).

See the [internal registration flow guide](../docs/internal/architecture/iam/registration-flow.md)
for validation, approval, and tests.

## Login and registration language

Choose **English** or **Deutsch** in Taramisu before signing in. Each authorization
request sends the current selection as OIDC `ui_locales`; Authentik sets its language
cookie and carries the choice into registration. A new sign-in request overrides
an earlier IAM language choice. Direct flow visits use Authentik's language cookie
or browser language; custom content falls back to English for languages other than German.

The enrollment blueprint routes German requests to `taramisu-authentication-de`
and `taramisu-enrollment-de`. These flows provide translated titles and prompt labels
while sharing password, MFA, account creation, and identifier-validation rules with
the English flows. Account approval remains mandatory in both languages.

Authentik 2026.8.3's in-flow locale selector changes frontend text without reloading
custom server-provided labels. Branding hides it to avoid a mixed-language form;
return to Taramisu and select the language there before starting a new sign-in.

After applying the blueprints, run the live regressions described in the
[registration flow guide](../docs/internal/architecture/iam/registration-flow.md).
They cover both languages, including stale language cookies, registration labels,
custom validation and confirmation. Existing security regressions cover approval,
identifier collisions, profile changes, and PKCE.

The redundant “Log in to continue to Taramisu” subtitle is hidden with branding CSS;
the translated flow heading identifies the application. This selector targets the
identification stage's introductory paragraph; check it when upgrading Authentik.

Authentik's own German catalogue still has some English accessibility labels and
formal wording on the password screen. We leave that catalogue unchanged. Native
required-field and email-format validation follows the browser's UI language;
custom registration validation follows the language selected in Taramisu.
