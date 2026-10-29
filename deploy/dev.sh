#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")"

case "${1:-}" in
    '') ;;
    --init) ;;
    *) echo 'Usage: deploy/dev.sh [--init]' >&2; exit 2 ;;
esac

if [ ! -e ../iam/.env ]; then
    # Never pair an existing database with freshly generated credentials.
    if ! docker info --format '{{.ServerVersion}}' > /dev/null 2>&1; then
        echo 'Docker must be running to check for existing IAM data before generating iam/.env.' >&2
        exit 1
    fi
    project=${COMPOSE_PROJECT_NAME:-taramisu}
    if docker volume inspect "$project-iam_authentik_database" > /dev/null 2>&1; then
        echo 'Existing Authentik database found, but iam/.env is missing. Restore its secrets before starting; no new secrets were generated.' >&2
        exit 1
    fi
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
            ../iam/.env.example > ../iam/.env
    )
    echo 'Generated local secrets in iam/.env (ignored by Git).'
fi

compose() { docker compose --env-file ../iam/.env -f compose.yaml "$@"; }
chmod 600 ../iam/.env
compose config --quiet
if [ "${1:-}" = --init ]; then
    exit 0
fi
if ! compose up -d --wait --wait-timeout 60 authentik-db; then
    echo 'Authentik database readiness failed. Check database logs and PG_PASS in iam/.env; an existing volume keeps its original database password.' >&2
    exit 1
fi
compose up -d --wait --wait-timeout 240 authentik-server authentik-worker
# Blueprint output may contain secrets.
: > ../iam/.blueprint.log
chmod 600 ../iam/.blueprint.log
if ! compose exec -T authentik-worker ak apply_blueprint \
    /blueprints/system/providers-oauth2.yaml \
    /blueprints/default/flow-password-change.yaml \
    /blueprints/default/flow-default-authentication-flow.yaml \
    /blueprints/default/flow-default-provider-authorization-implicit-consent.yaml \
    /blueprints/default/flow-default-provider-invalidation.yaml \
    /blueprints/custom/taramisu.yaml \
    /blueprints/custom/branding.yaml > ../iam/.blueprint.log 2>&1; then
    echo 'Authentik provisioning failed. Details: iam/.blueprint.log (private; may contain secrets).' >&2
    exit 1
fi
rm ../iam/.blueprint.log
compose up -d --build --wait --wait-timeout 180 api
if ! curl --fail --silent --max-time 2 --retry 15 --retry-connrefused \
    --retry-delay 1 --retry-max-time 30 http://localhost:8080/health/ready > /dev/null; then
    echo 'Backend readiness failed. Inspect: docker compose --env-file iam/.env -f deploy/compose.yaml logs api' >&2
    exit 1
fi

compose up -d --build --wait --wait-timeout 180 frontend proxy
# Compose does not recreate an existing proxy when its bind-mounted config changes.
# Reload also resolves the current API container address after a rebuild.
compose exec -T proxy nginx -t
compose exec -T proxy nginx -s reload

callback_url=$(compose exec -T authentik-worker printenv OIDC_REDIRECT_URI)
echo "Login: ${callback_url%/auth/callback}/auth/login (dev; DEV_PASSWORD in iam/.env)"
echo 'Authentik admin: http://authentik.localhost:9000 (akadmin; AUTHENTIK_BOOTSTRAP_PASSWORD in iam/.env)'
echo 'Frontend: http://localhost'
