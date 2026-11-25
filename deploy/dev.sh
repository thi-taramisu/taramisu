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
    dev_password=$(openssl rand -hex 16)
    admin_password=$(openssl rand -hex 24)
    api_token=$(openssl rand -hex 32)
    (
        set -C
        sed \
            -e "s/^PG_PASS=$/PG_PASS=$pg_pass/" \
            -e "s/^AUTHENTIK_SECRET_KEY=$/AUTHENTIK_SECRET_KEY=$authentik_key/" \
            -e "s/^DEV_PASSWORD=$/DEV_PASSWORD=$dev_password/" \
            -e "s/^AUTHENTIK_BOOTSTRAP_PASSWORD=$/AUTHENTIK_BOOTSTRAP_PASSWORD=$admin_password/" \
            -e "s/^AUTHENTIK_API_TOKEN=$/AUTHENTIK_API_TOKEN=$api_token/" \
            ../iam/.env.example > ../iam/.env
    )
    echo 'Generated local secrets in iam/.env (ignored by Git).'
fi

missing_storage_keys=""
for key in S3_ROOT_ACCESS_KEY S3_ROOT_SECRET_KEY S3_ACCESS_KEY S3_SECRET_KEY; do
    if [ ! -f ../storage/.env ] || ! grep -Eq "^[[:space:]]*(export[[:space:]]+)?$key[[:space:]]*=" ../storage/.env; then
        missing_storage_keys="$missing_storage_keys $key"
    fi
done
if [ -n "$missing_storage_keys" ]; then
    docker info > /dev/null 2>&1 || { echo 'Docker must be running to check for existing storage data.' >&2; exit 1; }
    if docker volume inspect "${COMPOSE_PROJECT_NAME:-taramisu}-storage_data" > /dev/null 2>&1; then
        echo 'Existing storage data found with missing credentials. Restore storage/.env.' >&2
        exit 1
    fi
    env_tmp=$(mktemp ../storage/.env.XXXXXX)
    trap 'rm -f "$env_tmp"' EXIT HUP INT TERM
    if [ -f ../storage/.env ]; then cat ../storage/.env > "$env_tmp"; fi
    printf '\n' >> "$env_tmp"
    for key in $missing_storage_keys; do
        value=$(openssl rand -hex 32)
        printf '%s=%s\n' "$key" "$value" >> "$env_tmp"
    done
    if ! grep -q '^S3_BUCKET=' "$env_tmp"; then printf 'S3_BUCKET=taramisu-uploads\n' >> "$env_tmp"; fi
    mv "$env_tmp" ../storage/.env
    trap - EXIT HUP INT TERM
    echo 'Added missing credentials to storage/.env.'
fi
chmod 600 ../storage/.env

# iam/.env files created before #186 lack the API token. Provisioning sets the token from this
# value, so generating it for existing data is safe. An empty value still fails below.
if ! grep -q '^AUTHENTIK_API_TOKEN=' ../iam/.env; then
    printf '\n# Token of the taramisu-api service account; the API reads users and groups with it.\nAUTHENTIK_API_TOKEN=%s\n' \
        "$(openssl rand -hex 32)" >> ../iam/.env
    echo 'Added AUTHENTIK_API_TOKEN to iam/.env.'
fi

compose() { docker compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml -f compose.dev.yaml "$@"; }
chmod 600 ../iam/.env
compose config --quiet
if [ "${1:-}" = --init ]; then
    exit 0
fi
if ! compose up -d --wait --wait-timeout 60 authentik-db; then
    echo 'Authentik database readiness failed. Check database logs and PG_PASS in iam/.env; an existing volume keeps its original database password.' >&2
    exit 1
fi
compose up -d --wait --wait-timeout 480 authentik-server authentik-worker
# Blueprint output may contain secrets.
: > ../iam/.blueprint.log
chmod 600 ../iam/.blueprint.log
if ! compose exec -T authentik-worker ak apply_blueprint $(grep -v '^#' authentik-blueprints.txt) > ../iam/.blueprint.log 2>&1; then
    echo 'Authentik provisioning failed. Details: iam/.blueprint.log (private; may contain secrets).' >&2
    exit 1
fi
rm ../iam/.blueprint.log
compose up -d --build --wait --wait-timeout 180 api
compose up -d --build --wait --wait-timeout 180 frontend proxy
# Compose does not recreate an existing proxy when its bind-mounted config changes.
# Reload also resolves the current API container address after a rebuild.
compose exec -T proxy nginx -t
compose exec -T proxy nginx -s reload
if ! curl --fail --silent --max-time 2 --retry 15 --retry-connrefused \
    --retry-delay 1 --retry-max-time 30 http://localhost/health/ready > /dev/null; then
    echo 'Backend readiness failed. Inspect: docker compose --env-file iam/.env --env-file storage/.env -f deploy/compose.yaml -f deploy/compose.dev.yaml logs api' >&2
    exit 1
fi

callback_url=$(compose exec -T authentik-worker printenv OIDC_REDIRECT_URI)
app_origin=${callback_url%/auth/callback}
echo "Login: $app_origin (dev; DEV_PASSWORD in iam/.env)"
echo "Authentik admin: $app_origin/auth/if/admin/ (akadmin; AUTHENTIK_BOOTSTRAP_PASSWORD in iam/.env)"
echo "Frontend: $app_origin"
