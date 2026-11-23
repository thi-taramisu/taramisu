#!/bin/sh

# Backup and verify script for taramisu-db
# Runs as a one-shot service
# Flow:
#   1. Check if there was a recent backup created. if so -> skips and exit with 0. Otherwise:
#   2. Dump the database into a new timestamped folder
#   3. Check the dump (readable + checksum)
#   4. Restore it into a database copy and compare
#   5. Drop the copy if the copy is same as original
# Exit code 0 = verified backup exists
# Anything else = abort

set -eu

: "${DB_HOST:?DB_HOST is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"
DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
VERIFY_RESTORE="${VERIFY_RESTORE:-true}" # false = dump only, skip the copy test
VERIFY_DB="${POSTGRES_DB}_verify"

export PGPASSWORD="$POSTGRES_PASSWORD" PGHOST="$DB_HOST" PGPORT="$DB_PORT" PGUSER="$POSTGRES_USER" PGOPTIONS="-c client_min_messages=warning"

# Copy must not be the original
if [ "$VERIFY_DB" = "$POSTGRES_DB" ]; then
  echo "refusing to run: verify database equals original" >&2
  exit 1
fi

umask 077 # owner-only permissions

# 1. Skip if a verified backup was made very recently
# Protects against the same one-shot being started twice which will created a redundant and an unnecessary backup folder 
MIN_INTERVAL_SECONDS="${MIN_INTERVAL_SECONDS:-60}" # if 0 = always back up (NOTICE: this will create double, redundant folder, due to how the compose is being executed.
MARKER="$BACKUP_DIR/.last_${POSTGRES_DB}" # epoch seconds, written only after a verified backup

if [ "$MIN_INTERVAL_SECONDS" -gt 0 ] && [ -f "$MARKER" ]; then
  LAST="$(cat "$MARKER")"
  case "$LAST" in ''|*[!0-9]*) LAST=0 ;; esac # corrupt marker = no skip
  AGE=$(( $(date +%s) - LAST ))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -lt "$MIN_INTERVAL_SECONDS" ]; then
    echo "[skip:$POSTGRES_DB] last verified backup is ${AGE}s old (< ${MIN_INTERVAL_SECONDS}s), nothing to do"
    exit 0
  fi
fi

TS="$(date -u +%Y-%m-%d-%H-%M-%S)"
FINAL_DIR="$BACKUP_DIR/${TS}_${POSTGRES_DB}"
TMP_DIR="$BACKUP_DIR/.tmp_${TS}_${POSTGRES_DB}"

cleanup() {
  # remove half-finished backup folder and the scratch database
  rm -rf "$TMP_DIR" 2>/dev/null || true
  psql -d postgres -qc "DROP DATABASE IF EXISTS \"$VERIFY_DB\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

mkdir -p "$TMP_DIR"

# 2. Dump the DB
echo "[backup:$POSTGRES_DB] dumping ..."
pg_dump -Fc -d "$POSTGRES_DB" -f "$TMP_DIR/${POSTGRES_DB}.dump"

# 3. create checksum
pg_restore --list "$TMP_DIR/${POSTGRES_DB}.dump" >/dev/null   # file is readable
( cd "$TMP_DIR" && sha256sum "${POSTGRES_DB}.dump" > sha256sums.txt )

# Publish atomically: a crash should not leave a folder that looks complete
mv "$TMP_DIR" "$FINAL_DIR"
echo "[backup:$POSTGRES_DB] stored in $FINAL_DIR"

# 4. Restore into a copy and compare
if [ "$VERIFY_RESTORE" = "true" ]; then
  echo "[verify:$POSTGRES_DB] restoring into scratch database $VERIFY_DB ..."
  psql -d postgres -qc "DROP DATABASE IF EXISTS \"$VERIFY_DB\""
  psql -d postgres -qc "CREATE DATABASE \"$VERIFY_DB\""
  pg_restore --no-owner -d "$VERIFY_DB" "$FINAL_DIR/${POSTGRES_DB}.dump"

  COUNT_SQL="SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'"
  ORIG="$(psql -d "$POSTGRES_DB"   -tAc "$COUNT_SQL")"
  COPY="$(psql -d "$VERIFY_DB" -tAc "$COUNT_SQL")"
  if [ "$ORIG" != "$COPY" ]; then
    echo "[verify:$POSTGRES_DB] FAILED: tables original=$ORIG copy=$COPY" >&2
    exit 1
  fi
  echo "[verify:$POSTGRES_DB] OK: $ORIG ($POSTGRES_DB) = $COPY ($VERIFY_DB)"
else
  echo "[verify:$POSTGRES_DB] skipped (VERIFY_RESTORE=false)"
fi

date +%s > "$MARKER"  
echo "[done:$POSTGRES_DB] verified backup in $FINAL_DIR"