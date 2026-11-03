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
cp ../proxy/nginx.conf "$scratch/proxy/"
mkdir "$scratch/storage"
cp ../storage/*.py ../storage/*.toml ../storage/Dockerfile ../storage/.env.example "$scratch/storage/"
cp dev.sh compose*.yaml Makefile "$scratch/deploy/"

cat > "$scratch/bin/docker" <<'STUB'
#!/bin/sh
set -eu
case "$1" in
    info) exit "${DOCKER_UNAVAILABLE:-0}" ;;
    volume)
        test "$2" = inspect
        case "$3" in
            "${COMPOSE_PROJECT_NAME:-taramisu}-iam_authentik_database") test "${EXISTING_IAM_VOLUME:-0}" = 1 ;;
            "${COMPOSE_PROJECT_NAME:-taramisu}-storage_data") test "${EXISTING_STORAGE_VOLUME:-0}" = 1 ;;
            *) exit 1 ;;
        esac
        exit $? ;;
esac
# Every operation must use the same entry point and explicit environment file.
case "$*" in
    'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml '*) ;;
    'compose --env-file ../iam/.env -f compose.yaml --profile tools down') ;;
    *) exit 1 ;;
esac
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
        storage_env=../storage/.env
        if [ ! -f "$storage_env" ]; then storage_env=/dev/null; fi
        "$REAL_DOCKER" compose --env-file ../iam/.env --env-file "$storage_env" -f compose.yaml config --quiet
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
unset S3_DEV_PORT S3_ENDPOINT S3_REGION S3_BUCKET S3_ACCESS_KEY S3_SECRET_KEY S3_ROOT_ACCESS_KEY S3_ROOT_SECRET_KEY
unset APP_URL OIDC_ISSUER OIDC_CLIENT_ID OIDC_CLIENT_SECRET PG_PASS
unset AUTHENTIK_SECRET_KEY DEV_PASSWORD AUTHENTIK_BOOTSTRAP_PASSWORD
unset COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES
unset IAM_FAIL API_FAIL WEB_FAIL BLUEPRINT_FAIL READY_FAIL DB_FAIL
unset PROXY_CONFIG_FAIL PROXY_RELOAD_FAIL
unset EXISTING_IAM_VOLUME EXISTING_STORAGE_VOLUME DOCKER_UNAVAILABLE

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
    /^readiness$/ { ready = NR }
    /up .*frontend proxy/ { web = NR }
    /proxy nginx -t$/ { validate = NR }
    /proxy nginx -s reload$/ { reload = NR }
    END { exit !(db > 0 && db < iam && iam < provision && provision < api && api < ready && ready < web && web < validate && validate < reload) }
' "$COMMAND_LOG"
grep -q '^Login:' "$scratch/output"
test ! -e "$scratch/iam/.blueprint.log"
run
test "$(cksum "$scratch/iam/.env")" = "$original"
cp "$scratch/iam/.env" "$scratch/valid.env"

cp "$scratch/storage/.env" "$scratch/valid-storage.env"
rm "$scratch/storage/.env"
: > "$COMMAND_LOG"
make -C "$scratch/deploy" down > "$scratch/output" 2>&1
cmp "$scratch/valid.env" "$scratch/iam/.env"
test ! -e "$scratch/storage/.env"
! grep -q ' up ' "$COMMAND_LOG"
export EXISTING_STORAGE_VOLUME=1
expect_failure
cmp "$scratch/valid.env" "$scratch/iam/.env"
test ! -e "$scratch/storage/.env"
unset EXISTING_STORAGE_VOLUME
run --init
cmp "$scratch/valid.env" "$scratch/iam/.env"
python3 - "$scratch" <<'PYTEST'
from pathlib import Path
import sys
root = Path(sys.argv[1])
p = root / 'storage/.env'
keys = [line.split('=', 1)[1] for line in p.read_text().splitlines() if line.startswith('S3_') and not line.startswith('S3_BUCKET=')]
assert len(keys) == len(set(keys)) == 4 and all(len(key) == 64 for key in keys)
assert p.stat().st_mode & 0o777 == 0o600
assert 'S3_' not in (root / 'iam/.env').read_text()
PYTEST
upgraded=$(cksum "$scratch/storage/.env")
run --init
test "$(cksum "$scratch/storage/.env")" = "$upgraded"
sed '/^S3_SECRET_KEY=/d' "$scratch/valid-storage.env" > "$scratch/storage/.env"
run --init
for key in S3_ROOT_ACCESS_KEY S3_ROOT_SECRET_KEY S3_ACCESS_KEY; do
    test "$(grep "^$key=" "$scratch/storage/.env")" = "$(grep "^$key=" "$scratch/valid-storage.env")"
done
cmp "$scratch/valid.env" "$scratch/iam/.env"

# Backend host configuration must never override the container configuration.
cat > "$scratch/backend/.env" <<'ENV'
APP_URL=http://host-only.invalid:8080
OIDC_ISSUER=http://localhost:9000/application/o/host-only/
OIDC_CLIENT_ID=host-only
OIDC_CLIENT_SECRET=
COMPOSE_PROJECT_NAME=host-only
ENV
make -C "$scratch/backend" up > "$scratch/output" 2>&1
grep -q '^Login:' "$scratch/output"
for directory in backend deploy; do
    : > "$COMMAND_LOG"
    make -C "$scratch/$directory" down > "$scratch/output" 2>&1
    test "$(cat "$COMMAND_LOG")" = 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml --profile tools down'
    : > "$COMMAND_LOG"
    make -C "$scratch/$directory" reset > "$scratch/output" 2>&1
    test "$(cat "$COMMAND_LOG")" = 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml --profile tools down -v'
done
: > "$COMMAND_LOG"
make -C "$scratch/backend" db pgadmin migrate migrate-diff name=test-change > "$scratch/output" 2>&1
grep -Fxq 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml up -d --wait db' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml up -d pgadmin' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml run --rm migrate' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml up -d --wait dev-db' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env --env-file ../storage/.env -f compose.yaml run --rm migrate migrate diff test-change --env local' "$COMMAND_LOG"
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
    if [ "$failure" = API_FAIL ] || [ "$failure" = READY_FAIL ]; then
        ! grep -q ' up .*frontend proxy' "$COMMAND_LOG"
    fi
    if [ "$failure" = PROXY_CONFIG_FAIL ]; then
        ! grep -q 'proxy nginx -s reload' "$COMMAND_LOG"
    fi
done

# Check the actual merged Compose model, including isolation and resolved paths.
APP_URL=http://127.0.0.1:8080 OIDC_CLIENT_ID=review-client \
    "$REAL_DOCKER" compose --env-file "$scratch/iam/.env" --env-file "$scratch/storage/.env" \
    -f "$scratch/deploy/compose.yaml" --profile tools config --format json > "$scratch/model.json"
"$REAL_DOCKER" compose --env-file "$scratch/iam/.env" --env-file "$scratch/storage/.env" \
    -p isolated-check -f "$scratch/deploy/compose.yaml" config --format json > "$scratch/isolated.json"
"$REAL_DOCKER" compose --env-file "$scratch/iam/.env" --env-file "$scratch/storage/.env" \
    -f "$scratch/deploy/compose.yaml" -f "$scratch/deploy/compose.storage-dev.yaml" \
    config --format json > "$scratch/storage-dev.json"
python3 - "$scratch" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1]).resolve()
model = json.loads((root / 'model.json').read_text())
services = model['services']
assert model['name'] == 'taramisu'
assert set(services) == {'api', 'db', 'dev-db', 'migrate', 'pgadmin', 'frontend', 'proxy', 'docs',
                         'authentik-server', 'authentik-worker', 'authentik-db', 'storage', 'storage-config', 'storage-init'}
expected_networks = {
    'api': {'default', 'backend', 'auth', 'taramisu-storage'},
    'storage': {'taramisu-storage'}, 'storage-config': {'taramisu-storage'}, 'storage-init': {'taramisu-storage'},
    'db': {'backend'}, 'dev-db': {'backend'}, 'migrate': {'backend'}, 'pgadmin': {'backend'},
    'frontend': {'default'}, 'proxy': {'default', 'taramisu-proxy'},
    'docs': {'taramisu-proxy'},
    'authentik-server': {'auth', 'iam'}, 'authentik-worker': {'iam'}, 'authentik-db': {'iam'},
}
for service, networks in expected_networks.items():
    assert set(services[service]['networks']) == networks, service
assert not any(network.get('external') for network in model['networks'].values())
assert 'authentik.localhost' in services['authentik-server']['networks']['auth']['aliases']
assert model['networks']['taramisu-storage']['internal']
assert not services['storage'].get('ports')
assert any(v['source'] == 'storage_data' and v['target'] == '/data' for v in services['storage']['volumes'])
dev_model = json.loads((root / 'storage-dev.json').read_text())
assert not dev_model['networks']['taramisu-storage'].get('internal', False)
ports = dev_model['services']['storage']['ports']
assert len(ports) == 1 and ports[0]['host_ip'] == '127.0.0.1' and ports[0]['target'] == 8333
assert str(ports[0]['published']) == '8333'
assert services['storage']['depends_on']['storage-config']['condition'] == 'service_completed_successfully'
assert services['api']['depends_on']['storage-init']['condition'] == 'service_completed_successfully'
assert services['api']['environment']['S3_ENDPOINT'] == 'http://storage:8333'
assert 'S3_ROOT_SECRET_KEY' not in services['api']['environment']
assert services['api']['environment']['S3_ACCESS_KEY'] != services['storage-init']['environment']['S3_ROOT_ACCESS_KEY']
api = services['api']
worker = services['authentik-worker']
assert api['environment']['APP_URL'] == 'http://127.0.0.1:8080'
assert worker['environment']['OIDC_REDIRECT_URI'] == 'http://127.0.0.1:8080/auth/callback'
assert api['environment']['OIDC_CLIENT_ID'] == worker['environment']['OIDC_CLIENT_ID'] == 'review-client'
assert api['environment']['OIDC_CLIENT_SECRET'] == worker['environment']['OIDC_CLIENT_SECRET']
assert api['environment']['OIDC_ISSUER'] == 'http://authentik.localhost:9000/application/o/taramisu/'
assert api['depends_on']['migrate']['condition'] == 'service_completed_successfully'
assert api['depends_on']['authentik-server']['condition'] == 'service_healthy'
assert services['pgadmin']['profiles'] == ['tools']
probe = services['authentik-db']['healthcheck']['test']
assert probe[0] == 'CMD-SHELL'
assert 'POSTGRES_PASSWORD' in probe[1] and 'psql -h authentik-db' in probe[1]
assert Path(services['storage-config']['build']['context']).resolve() == root / 'storage'
assert Path(api['build']['context']).resolve() == root / 'backend'
assert Path(services['frontend']['build']['context']).resolve() == root / 'frontend'
assert Path(services['docs']['build']['context']).resolve() == root
assert 'docs' in services['proxy']['depends_on']
assert not services['docs'].get('ports')
for service, target, source in [
    ('storage', '/etc/seaweedfs/filer.toml', root / 'storage/filer.toml'),
    ('migrate', '/app', root / 'backend'),
    ('authentik-worker', '/blueprints/custom', root / 'iam/blueprints'),
    ('authentik-server', '/web/dist/assets/icons/blank.svg', root / 'iam/branding/blank.svg'),
    ('proxy', '/etc/nginx/conf.d/default.conf', root / 'proxy/nginx.conf'),
]:
    mount = next(v for v in services[service]['volumes'] if v['target'] == target)
    assert Path(mount['source']).resolve() == source, (service, mount)
    assert source.exists()
expected_volumes = {
    'storage_data': 'taramisu-storage_data',
    'storage_config': 'taramisu-storage_config',
    'postgres_data': 'taramisu-backend_postgres_data',
    'pgadmin_data': 'taramisu-backend_pgadmin_data',
    'authentik_database': 'taramisu-iam_authentik_database',
    'authentik_data': 'taramisu-iam_authentik_data',
}
assert {key: value['name'] for key, value in model['volumes'].items()} == expected_volumes
isolated = json.loads((root / 'isolated.json').read_text())
assert isolated['name'] == 'isolated-check'
assert isolated['services']['api']['environment']['APP_URL'] == 'http://localhost'
assert isolated['services']['authentik-worker']['environment']['OIDC_REDIRECT_URI'] == 'http://localhost/auth/callback'
assert all(v['name'].startswith('isolated-check-') for v in isolated['volumes'].values())
assert all(n['name'].startswith('isolated-check_') for n in isolated['networks'].values())
PY
echo 'PASS: unified Compose model, isolated networks/volumes, startup order, commands, secrets, and failures.'
