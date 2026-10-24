# IAM research

Status: draft notes for Issue #3 - 13.10.2026

Goal: Looking for less setup through the admin UI and more configuration in the repo compared to keycloak.

## Authentik

- built a small Authentik proof of concept on `feature/IAM-init`. Looks promising so far, but there's still quite a lot
  to configure -> has to be discussed with team
- uses [YAML blueprints](https://docs.goauthentik.io/customize/blueprints/) to set up the application and a dev user.
  The flow system and model references still take some getting used to.
- Deleting a blueprint file leaves the objects behind. Need to handle removals explicitly.
- PoC: login uses Go/OIDC; project permissions are still missing. Sessions last eight hours, disappear on restart and
  aren't revoked when an account is disabled. Logout is local to Taramisu.

## ZITADEL

- [Official Terraform provider](https://zitadel.com/docs/guides/manage/terraform-provider), including updates and
  deletions. Worth trying if Authentik's blueprints turn out to be too fiddly.
- Still several things to run: API, login UI, proxy and Postgres. See the [Compose
  setup](https://zitadel.com/docs/self-hosting/deploy/compose).

## Keycloak

- Could also avoid most UI setup with its [Terraform provider](https://www.keycloak.org/2025/01/terraform-provider-release-5).
- Realm JSON alone won't cover later changes: [startup import skips realms that already
  exist](https://www.keycloak.org/server/importExport).

## Thoughts

- Leaning towards keeping Authentik for now. ZITADEL would be the next one to try.
- Keep project roles (Read/Write/Manage/Owner) in our database and check them in Go.
- Still open: local accounts or university SSO?
