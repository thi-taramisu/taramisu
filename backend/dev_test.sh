#!/bin/sh
# Setup tests with stubbed Docker and curl commands.
set -eu
umask 077
cd "$(dirname "$0")"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
export REAL_DOCKER="$(command -v docker)" COMMAND_LOG="$scratch/commands"
mkdir "$scratch/bin" "$scratch/iam" "$scratch/backend"
cp ../iam/.env.example ../iam/compose.yaml "$scratch/iam/"
cp dev.sh compose.yaml Makefile "$scratch/backend/"

cat > "$scratch/bin/docker" <<'SH'
#!/bin/sh
case "$5" in
    compose.yaml|../iam/compose.yaml) ;;
    *) exit 1 ;;
esac
echo "$*" >> "$COMMAND_LOG"
case " $* " in
    *" config --quiet "*) exec "$REAL_DOCKER" "$@" ;;
    *" ak apply_blueprint "*)
        echo 'blueprint diagnosis: sentinel-secret'
        exit "${BLUEPRINT_FAIL:-0}" ;;
    *" printenv OIDC_REDIRECT_URI "*) echo 'http://localhost:8080/auth/callback' ;;
    *" up "*|*" run --rm migrate "*|*" down "*)
        "$REAL_DOCKER" compose --env-file ../iam/.env -f "$5" config --quiet ;;
    *) exit 1 ;;
esac
SH
cat > "$scratch/bin/curl" <<'SH'
#!/bin/sh
echo readiness >> "$COMMAND_LOG"
exit "${READY_FAIL:-0}"
SH
chmod +x "$scratch/bin/docker" "$scratch/bin/curl"
export PATH="$scratch/bin:$PATH"
unset APP_URL OIDC_ISSUER OIDC_CLIENT_ID OIDC_CLIENT_SECRET PG_PASS
unset AUTHENTIK_SECRET_KEY DEV_PASSWORD AUTHENTIK_BOOTSTRAP_PASSWORD

run() { (cd "$scratch" && ./backend/dev.sh) > "$scratch/output" 2>&1; }
expect_failure() {
    if run; then
        echo 'Expected startup to fail' >&2
        exit 1
    fi
    ! grep -q '^Login:' "$scratch/output"
}

run
grep -q '^Login:' "$scratch/output"
test -n "$(find "$scratch/iam/.env" -perm 600)"
test ! -e "$scratch/iam/.blueprint.log"
awk '
    /compose.yaml up .*server worker/ { iam = NR }
    /ak apply_blueprint/ { provision = NR }
    /compose.yaml up .*api/ { api = NR }
    /^readiness$/ { ready = NR }
    END { exit !(iam > 0 && iam < provision && provision < api && api < ready) }
' "$COMMAND_LOG"
original=$(cksum "$scratch/iam/.env")
run
test "$(cksum "$scratch/iam/.env")" = "$original"
cp "$scratch/iam/.env" "$scratch/valid.env"

# Ignore backend/.env for container commands.
cat > "$scratch/backend/.env" <<'ENV'
APP_URL=http://host-only.invalid:8080
OIDC_ISSUER=http://localhost:9000/application/o/host-only/
OIDC_CLIENT_ID=host-only
OIDC_CLIENT_SECRET=
ENV
make -C "$scratch/backend" up > "$scratch/output" 2>&1
grep -q '^Login:' "$scratch/output"
: > "$COMMAND_LOG"
make -C "$scratch/backend" down > "$scratch/output" 2>&1
test "$(cat "$COMMAND_LOG")" = "$(printf '%s\n' \
    'compose --env-file ../iam/.env -f compose.yaml --profile tools down' \
    'compose --env-file ../iam/.env -f ../iam/compose.yaml down')"
make -C "$scratch/backend" db > "$scratch/output" 2>&1
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml up -d --wait db' "$COMMAND_LOG"
: > "$COMMAND_LOG"
make -C "$scratch/backend" reset > "$scratch/output" 2>&1
test "$(cat "$COMMAND_LOG")" = "$(printf '%s\n' \
    'compose --env-file ../iam/.env -f compose.yaml --profile tools down -v' \
    'compose --env-file ../iam/.env -f ../iam/compose.yaml down -v')"
make -C "$scratch/backend" migrate > "$scratch/output" 2>&1
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml run --rm migrate' "$COMMAND_LOG"
make -C "$scratch/backend" migrate-diff name=test-change > "$scratch/output" 2>&1
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml up -d --wait dev-db' "$COMMAND_LOG"
grep -Fxq 'compose --env-file ../iam/.env -f compose.yaml run --rm migrate migrate diff test-change --env local' "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$original"

# Reject incomplete .env files without changing them.
sed 's/^PG_PASS=$/PG_PASS=keep-existing/' ../iam/.env.example > "$scratch/iam/.env"
partial=$(cksum "$scratch/iam/.env")
: > "$COMMAND_LOG"
expect_failure
! grep -q ' up ' "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$partial"
cp "$scratch/valid.env" "$scratch/iam/.env"

export BLUEPRINT_FAIL=1
: > "$COMMAND_LOG"
expect_failure
unset BLUEPRINT_FAIL
! grep -q ' up .*api' "$COMMAND_LOG"
grep -q 'sentinel-secret' "$scratch/iam/.blueprint.log"
test -n "$(find "$scratch/iam/.blueprint.log" -perm 600)"
! grep -q 'sentinel-secret' "$scratch/output"

export READY_FAIL=1
expect_failure
unset READY_FAIL
grep -q 'Backend readiness failed' "$scratch/output"

# Keep the projects separate, sharing only the auth network and OIDC settings.
for project in backend iam; do
    APP_URL=http://127.0.0.1:8080 OIDC_CLIENT_ID=review-client \
        "$REAL_DOCKER" compose --env-file "$scratch/iam/.env" \
        -f "$scratch/$project/compose.yaml" config > "$scratch/$project-rendered"
    grep -q "^name: taramisu-$project$" "$scratch/$project-rendered"
    grep -q 'OIDC_CLIENT_ID: review-client' "$scratch/$project-rendered"
    grep -q 'name: taramisu-auth' "$scratch/$project-rendered"
done
! grep -q '^  server:' "$scratch/backend-rendered"
! grep -q '^  api:' "$scratch/iam-rendered"
grep -q 'external: true' "$scratch/backend-rendered"
! grep -q 'external: true' "$scratch/iam-rendered"
grep -q 'authentik.localhost' "$scratch/iam-rendered"
grep -q 'APP_URL: http://127.0.0.1:8080' "$scratch/backend-rendered"
grep -q 'OIDC_REDIRECT_URI: http://127.0.0.1:8080/auth/callback' "$scratch/iam-rendered"
echo 'PASS: separate projects, startup/shutdown order, configuration, secrets, and failures.'
