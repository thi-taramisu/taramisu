#!/bin/sh
# Validate the real Compose model while stubbing container operations and HTTP.
set -eu
umask 077
cd "$(dirname "$0")"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
export REAL_DOCKER="$(command -v docker)" COMMAND_LOG="$scratch/commands"
mkdir "$scratch/bin" "$scratch/iam" "$scratch/backend" "$scratch/deploy" "$scratch/frontend" "$scratch/proxy"
cp ../iam/.env.example "$scratch/iam/"
cp -R ../iam/branding ../iam/blueprints "$scratch/iam/"
cp ../backend/Makefile "$scratch/backend/"
cp ../proxy/nginx.conf ../proxy/25-sentry-ingest.sh "$scratch/proxy/"
cp dev.sh compose*.yaml Makefile authentik-blueprints.txt "$scratch/deploy/"

cat > "$scratch/bin/docker" <<'STUB'
#!/bin/sh
set -eu
case "$1" in
    info) exit "${DOCKER_UNAVAILABLE:-0}" ;;
    volume)
        test "$2" = inspect
        test "$3" = "${COMPOSE_PROJECT_NAME:-taramisu}-iam_authentik_database"
        if [ "${EXISTING_IAM_VOLUME:-0}" = 1 ]; then exit 0; else exit 1; fi ;;
esac
# Every operation must use the same entry point and explicit environment file.
test "$1 $2 $3 $4 $5 $6 $7" = 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml'
echo "$*" >> "$COMMAND_LOG"
case " $* " in
    *" config --quiet "*) exec "$REAL_DOCKER" "$@" ;;
    *" ak apply_blueprint "*)
        echo 'blueprint diagnosis: sentinel-secret'
        exit "${BLUEPRINT_FAIL:-0}" ;;
    *" printenv OIDC_REDIRECT_URI "*) echo 'http://localhost/auth/callback' ;;
    *" proxy nginx -t "*) exit "${PROXY_CONFIG_FAIL:-0}" ;;
    *" proxy nginx -s reload "*) exit "${PROXY_RELOAD_FAIL:-0}" ;;
    *" up "*|*" run --rm migrate "*|*" down "*)
        "$REAL_DOCKER" compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml config --quiet
        case " $* " in
            *" authentik-db "*) exit "${DB_FAIL:-0}" ;;
            *" authentik-server authentik-worker "*) exit "${IAM_FAIL:-0}" ;;
            *" api "*) exit "${API_FAIL:-0}" ;;
            *" frontend proxy "*) exit "${WEB_FAIL:-0}" ;;
        esac ;;
    *) exit 1 ;;
esac
STUB
cat > "$scratch/bin/curl" <<'STUB'
#!/bin/sh
echo readiness >> "$COMMAND_LOG"
exit "${READY_FAIL:-0}"
STUB
chmod +x "$scratch/bin/docker" "$scratch/bin/curl"
export PATH="$scratch/bin:$PATH"
unset APP_URL OIDC_ISSUER OIDC_JWKS_URL OIDC_CLIENT_ID PG_PASS
unset AUTHENTIK_SECRET_KEY DEV_PASSWORD AUTHENTIK_BOOTSTRAP_PASSWORD AUTHENTIK_API_TOKEN
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES
unset IAM_FAIL API_FAIL WEB_FAIL BLUEPRINT_FAIL READY_FAIL DB_FAIL
unset PROXY_CONFIG_FAIL PROXY_RELOAD_FAIL
unset EXISTING_IAM_VOLUME DOCKER_UNAVAILABLE

run() { (cd "$scratch" && ./deploy/dev.sh "$@") > "$scratch/output" 2>&1; }
expect_failure() {
    if run; then
        echo 'Expected startup to fail' >&2
        exit 1
    fi
    ! grep -q '^Login:' "$scratch/output"
}

# Missing credentials must not silently create a new password for existing data.
export EXISTING_IAM_VOLUME=1
expect_failure
test ! -e "$scratch/iam/.env"
grep -q 'Restore its secrets' "$scratch/output"
(export COMPOSE_PROJECT_NAME=custom-check; expect_failure)
test ! -e "$scratch/iam/.env"
unset EXISTING_IAM_VOLUME
export DOCKER_UNAVAILABLE=1
expect_failure
test ! -e "$scratch/iam/.env"
unset DOCKER_UNAVAILABLE

# Initialization works independently of the application and keeps secrets private.
run --init
! grep -q ' up ' "$COMMAND_LOG"
test -n "$(find "$scratch/iam/.env" -perm 600)"
original=$(cksum "$scratch/iam/.env")
run
awk '
    /up .* authentik-db$/ { db = NR }
    /up .*authentik-server authentik-worker/ { iam = NR }
    /ak apply_blueprint/ { provision = NR }
    /up .* api$/ { api = NR }
    /up .*frontend proxy/ { web = NR }
    /proxy nginx -t$/ { validate = NR }
    /proxy nginx -s reload$/ { reload = NR }
    /^readiness$/ { ready = NR }
    END { exit !(db > 0 && db < iam && iam < provision && provision < api && api < web && web < validate && validate < reload && reload < ready) }
' "$COMMAND_LOG"
grep -q '/blueprints/custom/enrollment.yaml' "$COMMAND_LOG"
grep -q '/blueprints/default/flow-default-user-settings-flow.yaml' "$COMMAND_LOG"
grep -q '^Login:' "$scratch/output"
test ! -e "$scratch/iam/.blueprint.log"
run
test "$(cksum "$scratch/iam/.env")" = "$original"
cp "$scratch/iam/.env" "$scratch/valid.env"

# Backend host configuration must never override the container configuration.
cat > "$scratch/backend/.env" <<'ENV'
APP_URL=http://host-only.invalid:8080
OIDC_ISSUER=http://localhost:9000/application/o/host-only/
OIDC_CLIENT_ID=host-only
COMPOSE_PROJECT_NAME=host-only
ENV
make -C "$scratch/backend" up > "$scratch/output" 2>&1
grep -q '^Login:' "$scratch/output"
for directory in backend deploy; do
    : > "$COMMAND_LOG"
    make -C "$scratch/$directory" down > "$scratch/output" 2>&1
    test "$(cat "$COMMAND_LOG")" = 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml --profile tools down'
    : > "$COMMAND_LOG"
    make -C "$scratch/$directory" reset > "$scratch/output" 2>&1
    test "$(cat "$COMMAND_LOG")" = 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml --profile tools down -v'
done
: > "$COMMAND_LOG"
make -C "$scratch/backend" db pgadmin migrate migrate-diff name=test-change > "$scratch/output" 2>&1
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml up -d --wait db' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml up -d pgadmin' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml run --rm migrate' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml up -d --wait dev-db' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml -f compose.dev.yaml run --rm migrate migrate diff test-change --env local' "$COMMAND_LOG"
! grep -q ' up .*authentik-server' "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$original"

# Reject incomplete .env files without replacing them or starting containers.
sed 's/^PG_PASS=$/PG_PASS=keep-existing/' ../iam/.env.example > "$scratch/iam/.env"
partial=$(cksum "$scratch/iam/.env")
: > "$COMMAND_LOG"
expect_failure
! grep -q ' up ' "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$partial"
cp "$scratch/valid.env" "$scratch/iam/.env"

# iam/.env files from before the API token get it appended; other secrets stay unchanged.
grep -v -e '^AUTHENTIK_API_TOKEN=' -e '^# Token of the taramisu-api' "$scratch/valid.env" > "$scratch/iam/.env"
cp "$scratch/iam/.env" "$scratch/old.env"
run --init
grep -q 'Added AUTHENTIK_API_TOKEN' "$scratch/output"
grep -Eq '^AUTHENTIK_API_TOKEN=[0-9a-f]{64}$' "$scratch/iam/.env"
test "$(grep -v -e '^AUTHENTIK_API_TOKEN=' -e '^# Token of the taramisu-api' "$scratch/iam/.env" | sed '/^$/d')" = "$(sed '/^$/d' "$scratch/old.env")"
run --init
! grep -q 'Added AUTHENTIK_API_TOKEN' "$scratch/output"
cp "$scratch/valid.env" "$scratch/iam/.env"

export DB_FAIL=1
: > "$COMMAND_LOG"
expect_failure
unset DB_FAIL
! grep -q ' up .*authentik-server' "$COMMAND_LOG"
! grep -q 'ak apply_blueprint' "$COMMAND_LOG"
grep -q 'existing volume keeps its original database password' "$scratch/output"

export IAM_FAIL=1
: > "$COMMAND_LOG"
expect_failure
unset IAM_FAIL
! grep -q 'ak apply_blueprint' "$COMMAND_LOG"
! grep -q ' up .* api$' "$COMMAND_LOG"

export BLUEPRINT_FAIL=1
: > "$COMMAND_LOG"
expect_failure
unset BLUEPRINT_FAIL
! grep -q ' up .* api$' "$COMMAND_LOG"
grep -q 'sentinel-secret' "$scratch/iam/.blueprint.log"
test -n "$(find "$scratch/iam/.blueprint.log" -perm 600)"
! grep -q 'sentinel-secret' "$scratch/output"

for failure in API_FAIL READY_FAIL WEB_FAIL PROXY_CONFIG_FAIL PROXY_RELOAD_FAIL; do
    export "$failure=1"
    : > "$COMMAND_LOG"
    expect_failure
    unset "$failure"
    if [ "$failure" = API_FAIL ]; then
        ! grep -q ' up .*frontend proxy' "$COMMAND_LOG"
    fi
    if [ "$failure" = PROXY_CONFIG_FAIL ]; then
        ! grep -q 'proxy nginx -s reload' "$COMMAND_LOG"
    fi
done

# Check the actual merged Compose model, including isolation and resolved paths.
APP_URL=http://127.0.0.1:8080 OIDC_CLIENT_ID=review-client \
    "$REAL_DOCKER" compose --env-file "$scratch/iam/.env" \
    -f "$scratch/deploy/compose.yaml" --profile tools config --format json > "$scratch/model.json"
"$REAL_DOCKER" compose --env-file "$scratch/iam/.env" \
    -f "$scratch/deploy/compose.yaml" -f "$scratch/deploy/compose.dev.yaml" --profile tools config --format json > "$scratch/dev.json"
"$REAL_DOCKER" compose --env-file "$scratch/iam/.env" \
    -p isolated-check -f "$scratch/deploy/compose.yaml" config --format json > "$scratch/isolated.json"
python3 - "$scratch" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
model = json.loads((root / 'model.json').read_text())
services = model['services']
assert model['name'] == 'taramisu'
assert set(services) == {'api', 'db', 'dev-db', 'migrate', 'pgadmin', 'frontend', 'proxy', 'sentry-ingest', 'docs',
                         'authentik-server', 'authentik-worker', 'authentik-db'}
expected_networks = {
    'api': {'proxy', 'app-db'},
    'db': {'app-db'}, 'dev-db': {'app-db'}, 'migrate': {'app-db'}, 'pgadmin': {'app-db'},
    'frontend': {'proxy'}, 'proxy': {'edge', 'proxy'},
    'sentry-ingest': {'edge', 'proxy'},
    'authentik-server': {'proxy', 'iam-db'}, 'authentik-worker': {'iam-db'}, 'authentik-db': {'iam-db'},
    'docs': {'proxy'},
}
for service, networks in expected_networks.items():
    assert set(services[service]['networks']) == networks, service
assert not any(network.get('external') for network in model['networks'].values())
assert {key: bool(value.get('internal')) for key, value in model['networks'].items()} == {
    'edge': False, 'proxy': True, 'app-db': True, 'iam-db': True}
assert services['authentik-server']['environment']['AUTHENTIK_DISABLE_UPDATE_CHECK'] == 'true'
# Without the dev override only the proxy publishes a port.
assert {name for name, service in services.items() if service.get('ports')} == {'proxy'}
dev = json.loads((root / 'dev.json').read_text())
assert not any(dev['networks'][network].get('internal') for network in ('dev-app', 'dev-iam'))
expected_ports = {'proxy': '80', 'db': '5432', 'pgadmin': '5050', 'authentik-server': '9000'}
# Separate dev networks, so the published ports do not connect the application and the Authentik side.
dev_networks = {'db': {'dev-app'}, 'pgadmin': {'dev-app'}, 'authentik-server': {'dev-iam'}}
for name, service in dev['services'].items():
    published = {port['published'] for port in service.get('ports', [])}
    assert published == ({expected_ports[name]} if name in expected_ports else set()), name
    assert set(service['networks']) == expected_networks[name] | dev_networks.get(name, set()), name
assert all(port['host_ip'] == '127.0.0.1' for service in dev['services'].values() for port in service.get('ports', []))
api = services['api']
worker = services['authentik-worker']
server = services['authentik-server']
assert server['environment']['AUTHENTIK_WEB__PATH'] == '/auth/'
assert worker['environment']['AUTHENTIK_WEB__PATH'] == '/auth/'
assert api['environment']['APP_URL'] == 'http://127.0.0.1:8080'
assert worker['environment']['OIDC_REDIRECT_URI'] == 'http://127.0.0.1:8080/auth/callback'
assert api['environment']['OIDC_CLIENT_ID'] == worker['environment']['OIDC_CLIENT_ID'] == 'review-client'
assert 'OIDC_CLIENT_SECRET' not in api['environment']
assert api['environment']['AUTHENTIK_API_URL'] == 'http://authentik-server:9000/auth'
assert api['environment']['AUTHENTIK_API_TOKEN'] == worker['environment']['AUTHENTIK_API_TOKEN'] != ''
assert 'OIDC_CLIENT_SECRET' not in worker['environment']
assert api['environment']['OIDC_ISSUER'] == 'http://127.0.0.1:8080/auth/application/o/taramisu/'
assert api['environment']['OIDC_JWKS_URL'] == 'http://authentik-server:9000/auth/application/o/taramisu/jwks/'
assert api['depends_on']['migrate']['condition'] == 'service_completed_successfully'
assert api['environment']['SENTRY_ENVIRONMENT'] == services['frontend']['build']['args']['VITE_SENTRY_ENVIRONMENT'] == 'production'
assert api['environment']['SENTRY_TUNNEL_URL'] == 'http://sentry-ingest:8081'
assert api['stop_grace_period'] == '15s'
assert services['sentry-ingest']['environment']['SENTRY_DSN'] == ''
assert api['depends_on']['sentry-ingest']['condition'] == 'service_healthy'
assert not services['sentry-ingest'].get('ports')
assert 'authentik-server' not in api['depends_on']
assert services['pgadmin']['profiles'] == ['tools']
probe = services['authentik-db']['healthcheck']['test']
assert probe[0] == 'CMD-SHELL'
assert 'POSTGRES_PASSWORD' in probe[1] and 'psql -h authentik-db' in probe[1]
assert Path(api['build']['context']).resolve() == root / 'backend'
assert Path(services['frontend']['build']['context']).resolve() == root / 'frontend'
assert Path(services['docs']['build']['context']).resolve() == root
assert 'docs' in services['proxy']['depends_on']
assert not services['docs'].get('ports')
assert not api.get('ports')
blueprint_text = (root / 'iam/blueprints/taramisu.yaml').read_text()
assert 'matching_mode: regex' not in blueprint_text
assert 'url: http://localhost:5173/auth/callback' in blueprint_text
for service, target, source in [
    ('migrate', '/app', root / 'backend'),
    ('authentik-worker', '/blueprints/custom', root / 'iam/blueprints'),
    ('authentik-server', '/web/dist/assets/icons/blank.svg', root / 'iam/branding/blank.svg'),
    ('proxy', '/etc/nginx/conf.d/default.conf', root / 'proxy/nginx.conf'),
    ('sentry-ingest', '/docker-entrypoint.d/25-sentry-ingest.sh', root / 'proxy/25-sentry-ingest.sh'),
]:
    mount = next(v for v in services[service]['volumes'] if v['target'] == target)
    assert Path(mount['source']).resolve() == source, (service, mount)
    assert source.exists()
expected_volumes = {
    'postgres_data': 'taramisu-backend_postgres_data',
    'pgadmin_data': 'taramisu-backend_pgadmin_data',
    'authentik_database': 'taramisu-iam_authentik_database',
    'authentik_data': 'taramisu-iam_authentik_data',
}
assert {key: value['name'] for key, value in model['volumes'].items()} == expected_volumes
isolated = json.loads((root / 'isolated.json').read_text())
assert isolated['name'] == 'isolated-check'
assert isolated['services']['api']['environment']['APP_URL'] == 'http://localhost'
assert isolated['services']['api']['environment']['OIDC_ISSUER'] == 'http://localhost/auth/application/o/taramisu/'
assert isolated['services']['authentik-worker']['environment']['OIDC_REDIRECT_URI'] == 'http://localhost/auth/callback'
assert all(v['name'].startswith('isolated-check-') for v in isolated['volumes'].values())
assert all(n['name'].startswith('isolated-check_') for n in isolated['networks'].values())
PY

# Verify NGINX starts without Authentik present and recovers dynamically when Authentik starts.
if [ -n "$REAL_DOCKER" ] && "$REAL_DOCKER" info >/dev/null 2>&1; then
    TEST_NET="taramisu-test-proxy-$$-net"
    "$REAL_DOCKER" network create "$TEST_NET" >/dev/null
    cleanup_proxy_test() {
        "$REAL_DOCKER" rm -f "proxy-$$" "frontend-$$" "docs-$$" "authentik-$$" >/dev/null 2>&1 || true
        "$REAL_DOCKER" network rm "$TEST_NET" >/dev/null 2>&1 || true
        rm -rf "$scratch"
    }
    trap cleanup_proxy_test EXIT HUP INT TERM

    "$REAL_DOCKER" run -d --name "frontend-$$" --network "$TEST_NET" --network-alias frontend nginx:1.28-alpine >/dev/null
    "$REAL_DOCKER" run -d --name "docs-$$" --network "$TEST_NET" --network-alias docs nginx:1.28-alpine >/dev/null
    "$REAL_DOCKER" run -d --name "proxy-$$" --network "$TEST_NET" -v "$scratch/proxy/nginx.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.28-alpine >/dev/null

    sleep 2
    test "$("$REAL_DOCKER" inspect -f '{{.State.Running}}' "proxy-$$")" = "true"
    "$REAL_DOCKER" run --rm --network "$TEST_NET" nginx:1.28-alpine wget -q -O - "http://proxy-$$/" | grep -q '<title>Welcome to nginx!</title>'
    "$REAL_DOCKER" run --rm --network "$TEST_NET" nginx:1.28-alpine sh -c "wget -O - 'http://proxy-$$/auth/' 2>&1 | grep -q '502 Bad Gateway'"

    "$REAL_DOCKER" run -d --name "authentik-$$" --network "$TEST_NET" --network-alias authentik-server nginx:1.28-alpine sh -c "cat > /etc/nginx/conf.d/default.conf << 'EOF'
server {
  listen 9000;
  location /auth/ {
    return 200 'authentik-ok';
  }
}
EOF
nginx -g 'daemon off;'
" >/dev/null

    # Poll until NGINX re-resolves the upstream after its resolver TTL and forwards to authentik-server.
    recovered=0
    for _ in $(seq 1 15); do
        if "$REAL_DOCKER" run --rm --network "$TEST_NET" nginx:1.28-alpine wget -q -O - "http://proxy-$$/auth/" 2>/dev/null | grep -q 'authentik-ok'; then
            recovered=1
            break
        fi
        sleep 1
    done
    test "$recovered" = 1

    "$REAL_DOCKER" rm -f "proxy-$$" "frontend-$$" "docs-$$" "authentik-$$" >/dev/null 2>&1
    "$REAL_DOCKER" network rm "$TEST_NET" >/dev/null 2>&1
fi

# The project role specification accepts that group and account changes take up to 10 minutes,
# the access token lifetime (docs/internal/architecture/iam/project-roles.md). Update both together.
grep -q '^ *access_token_validity: minutes=10$' ../iam/blueprints/taramisu.yaml

python3 -I stack_test.py --self-check >/dev/null
make -n test-stack >/dev/null

echo 'PASS: unified Compose model, access token lifetime, segmented networks and ports, isolated networks/volumes, startup order, commands, secrets, and failures.'
