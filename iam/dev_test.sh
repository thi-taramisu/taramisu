#!/bin/sh
# Setup tests with stubbed Docker and curl commands.
set -eu
umask 077
cd "$(dirname "$0")"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
export REAL_DOCKER="$(command -v docker)" COMMAND_LOG="$scratch/commands"
mkdir "$scratch/bin" "$scratch/iam" "$scratch/backend"
cp dev.sh .env.example compose.yaml "$scratch/iam/"
cp ../backend/compose.yaml ../backend/Makefile "$scratch/backend/"

cat > "$scratch/bin/docker" <<'SH'
#!/bin/sh
case " $* " in
    *" config --quiet "*) exec "$REAL_DOCKER" "$@" ;;
    *" ak apply_blueprint "*)
        echo 'blueprint diagnosis: sentinel-secret'
        exit "${BLUEPRINT_FAIL:-0}" ;;
    *" up "*) echo up >> "$COMMAND_LOG" ;;
    *" --env-file ../iam/.env -f ../iam/compose.yaml --profile tools down "*)
        "$REAL_DOCKER" compose --env-file ../iam/.env -f ../iam/compose.yaml config --quiet || exit 1
        echo down >> "$COMMAND_LOG" ;;
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

run() { "$scratch/iam/dev.sh" > "$scratch/output" 2>&1; }
expect_failure() {
    if run; then
        echo 'Expected startup to fail' >&2
        exit 1
    fi
    ! grep -q '^Backend ready:' "$scratch/output"
}

run
grep -q '^Backend ready:' "$scratch/output"
test -n "$(find "$scratch/iam/.env" -perm 600)"
test ! -e "$scratch/iam/.blueprint.log"
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
grep -q '^Backend ready:' "$scratch/output"
make -C "$scratch/backend" down > "$scratch/output" 2>&1
grep -q '^down$' "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$original"

# Reject incomplete .env files without changing them.
sed 's/^PG_PASS=$/PG_PASS=keep-existing/' .env.example > "$scratch/iam/.env"
partial=$(cksum "$scratch/iam/.env")
: > "$COMMAND_LOG"
expect_failure
test ! -s "$COMMAND_LOG"
test "$(cksum "$scratch/iam/.env")" = "$partial"
cp "$scratch/valid.env" "$scratch/iam/.env"

export BLUEPRINT_FAIL=1
expect_failure
unset BLUEPRINT_FAIL
grep -q 'sentinel-secret' "$scratch/iam/.blueprint.log"
test -n "$(find "$scratch/iam/.blueprint.log" -perm 600)"
! grep -q 'sentinel-secret' "$scratch/output"

export READY_FAIL=1
expect_failure
unset READY_FAIL
grep -q 'Backend readiness failed' "$scratch/output"

# Share client ID and callback settings with the API.
APP_URL=http://127.0.0.1:8080 OIDC_CLIENT_ID=review-client \
    "$REAL_DOCKER" compose --env-file "$scratch/iam/.env" \
    -f "$scratch/iam/compose.yaml" config > "$scratch/rendered"
test "$(grep -c 'OIDC_CLIENT_ID: review-client' "$scratch/rendered")" -eq 2
grep -q 'APP_URL: http://127.0.0.1:8080' "$scratch/rendered"
grep -q 'OIDC_REDIRECT_URI: http://127.0.0.1:8080/auth/callback' "$scratch/rendered"
echo 'PASS: configuration, secret preservation, private diagnostics, and readiness failures.'
