# Registration flow

Registration uses Authentik's enrollment flow to create inactive accounts.
An administrator must approve each account before it can sign in with either
its username or email.

## Registration and approval

1. The user follows **Sign up** from Authentik's login screen.
2. The enrollment flow collects username, name, email, password, and password
   confirmation. Fields are required, the email must have a valid format, and
   matching passwords must contain at least 12 characters.
3. Usernames are stored lowercase and accept 1–150 ASCII letters, digits, dots,
   underscores, or hyphens. Validation reserves usernames and emails for both
   pending and active accounts. The same policy applies to profile edits.
4. The User Write stage creates an inactive account. A confirmation explains that
   administrator approval is required. There is no User Login stage, so registration
   does not establish a session or create an application database user.
5. An administrator reviews the account in **Directory → Users**, enables
   **Active**, and saves. The user can then use the existing login flow.

Email verification and approval notifications are not implemented. Approval uses
the account's active flag; group membership does not determine approval.

Configuration: [enrollment blueprint](../../../../iam/blueprints/enrollment.yaml).

## Identifier collisions

Login accepts usernames and emails case-insensitively. Usernames cannot contain
`@`, keeping new usernames separate from email addresses. Lowercase storage lets
Authentik's existing username uniqueness constraint prevent concurrent case
variants. A losing concurrent request may show Authentik's generic write error.

Email uniqueness uses a flow policy, not a database constraint. Simultaneous
registrations can still create two accounts with the same email. A Deny stage
between identification and password entry blocks identifiers matching multiple
accounts, including legacy username/email overlaps. Each unique username still
works. An administrator must correct the conflicting identifier in **Directory →
Users** before email login works again.

These rules cover enrollment and the default profile-edit flow. Admin/API writes
and external sources can bypass these policies; use the same naming rules there.
Existing accounts are not renamed. Audit collisions before enabling this flow on
an existing deployment. The login guard does not cover separate recovery flows.

## Startup and local verification

[`deploy/dev.sh`](../../../../deploy/dev.sh) starts Authentik and applies the built-in
flows followed by the application, enrollment, and branding blueprints before
starting the API. Enrollment configuration does not manage individual user records,
so reapplication preserves approvals. The seeded `dev` account is a separate
exception: the application blueprint sets it active on startup.

See the [IAM README](../../../../iam/README.md) for startup commands and local access.
To check the flow against the running stack:

1. Open the application login in a private browser session and follow **Sign up**.
   Check empty fields, malformed email, mismatched or short passwords, and an
   existing username with both identical and different casing.
2. Register two distinct accounts. Confirm the approval message, inactive status
   in Authentik, and no new `iam_user` rows. Pending login must fail.
3. Activate one account through the admin interface. Sign in separately with its
   username and email, and check that `/api/v1/me` returns the same local user ID.
4. Reapply startup configuration with `make -C deploy up`. The approved account
   should still sign in, while the other account remains inactive and blocked.
   Remove the test accounts and their application records afterward.

Run the collision regressions from the repository root after applying the
blueprints:

```sh
docker compose --env-file iam/.env -f deploy/compose.yaml exec -T authentik-worker ak shell < iam/test_enrollment.py
```

The tests call live enrollment, login, and profile-edit endpoints. They cover
approval, sequential and concurrent collisions, ambiguous login rejection, and
profile validation, and remove their temporary Authentik users.
