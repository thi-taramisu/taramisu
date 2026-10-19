#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"

if [ ! -e .env ]; then
    pg_pass=$(openssl rand -hex 32)
    authentik_key=$(openssl rand -hex 48)
    client_secret=$(openssl rand -hex 32)
    dev_password=$(openssl rand -hex 16)
    admin_password=$(openssl rand -hex 24)
    (
        set -C
        sed \
            -e "s/^PG_PASS=$/PG_PASS=$pg_pass/" \
            -e "s/^AUTHENTIK_SECRET_KEY=$/AUTHENTIK_SECRET_KEY=$authentik_key/" \
            -e "s/^OIDC_CLIENT_SECRET=$/OIDC_CLIENT_SECRET=$client_secret/" \
            -e "s/^DEV_PASSWORD=$/DEV_PASSWORD=$dev_password/" \
            -e "s/^AUTHENTIK_BOOTSTRAP_PASSWORD=$/AUTHENTIK_BOOTSTRAP_PASSWORD=$admin_password/" \
            .env.example > .env
    )
    echo 'Generated local secrets in iam/.env (ignored by Git).'
fi

compose() { docker compose --env-file .env "$@"; }
chmod 600 .env
compose config --quiet
compose up -d --wait --wait-timeout 240 db server worker
# Blueprint output may contain secrets.
: > .blueprint.log
chmod 600 .blueprint.log
if ! compose exec -T worker ak apply_blueprint \
    /blueprints/system/providers-oauth2.yaml \
    /blueprints/default/flow-password-change.yaml \
    /blueprints/default/flow-default-authentication-flow.yaml \
    /blueprints/default/flow-default-provider-authorization-implicit-consent.yaml \
    /blueprints/default/flow-default-provider-invalidation.yaml \
    /blueprints/custom/taramisu.yaml \
    /blueprints/custom/branding.yaml > .blueprint.log 2>&1; then
    echo 'Authentik provisioning failed. Details: iam/.blueprint.log (private; may contain secrets).' >&2
    exit 1
fi
rm .blueprint.log
compose up -d --build --wait --wait-timeout 180 api
if ! curl --fail --silent --max-time 2 --retry 15 --retry-connrefused \
    --retry-delay 1 --retry-max-time 30 http://localhost:8080/health/ready > /dev/null; then
    echo 'Backend readiness failed. Inspect: docker compose --env-file iam/.env -f iam/compose.yaml logs api' >&2
    exit 1
fi

callback_url=$(compose exec -T worker printenv OIDC_REDIRECT_URI)
echo "Login: ${callback_url%/auth/callback}/auth/login (dev; DEV_PASSWORD in iam/.env)"
echo 'Authentik admin: http://authentik.localhost:9000 (akadmin; AUTHENTIK_BOOTSTRAP_PASSWORD in iam/.env)'
