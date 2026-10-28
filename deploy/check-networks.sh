#!/usr/bin/env bash
# Checks the network segmentation of the running stack (architecture overview, #87):
# allowed paths must be reachable, forbidden paths must not be.
#
# A throwaway busybox container joins one network at a time and tries to open a TCP connection.
# This tests the network itself, so it also covers distroless images like the API, which have no shell.
#
# Usage: make -C deploy check-networks   (the stack must be running, e.g. make -C deploy up)
set -euo pipefail

PROJECT=${COMPOSE_PROJECT_NAME:-taramisu} # Compose prefixes network names with the project name
IMAGE=busybox:1.37
INTERNET=1.1.1.1:443 # IP instead of a hostname, so the check does not depend on DNS
failures=0

# check <network> <host:port> <expected: open|closed> <description>
check() {
  local network=${PROJECT}_$1 target=$2 expected=$3 description=$4
  local actual=closed
  if docker run --rm --network "$network" "$IMAGE" nc -z -w 2 "${target%:*}" "${target#*:}" >/dev/null 2>&1; then
    actual=open
  fi

  if [ "$actual" = "$expected" ]; then
    printf '  ok    %-16s -> %-24s %-6s  %s\n' "$1" "$target" "$actual" "$description"
  else
    printf '  FAIL  %-16s -> %-24s %-6s  %s (expected %s)\n' "$1" "$target" "$actual" "$description" "$expected"
    failures=$((failures + 1))
  fi
}

docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull -q "$IMAGE" >/dev/null

echo "Allowed:"
check proxy  frontend:80              open "proxy forwards to the frontend"
check proxy  api:8080                 open "proxy forwards to the API"
check proxy  docs:80                  open "proxy forwards to the docs"
check proxy  authentik.localhost:9000 open "API reaches Authentik"
check app-db db:5432                  open "API reaches the database"
check iam-db authentik-db:5432        open "Authentik reaches its database"
check edge   "$INTERNET"              open "edge has internet access (shows that the check itself works)"

echo "Forbidden:"
check proxy  db:5432                  closed "proxy network cannot reach the database"
check proxy  authentik-db:5432        closed "proxy network cannot reach the Authentik database"
check app-db authentik-db:5432        closed "API cannot reach the Authentik database"
check iam-db db:5432                  closed "Authentik cannot reach the application database"
check edge   api:8080                 closed "edge cannot reach the API directly"
check edge   frontend:80              closed "edge cannot reach the frontend directly"
check edge   docs:80                  closed "edge cannot reach the docs directly"
check edge   db:5432                  closed "edge cannot reach the database"
check proxy  "$INTERNET"              closed "API, frontend, docs and Authentik server have no internet access"
check app-db "$INTERNET"              closed "database network has no internet access"
check iam-db "$INTERNET"              closed "Authentik database network has no internet access"

if [ "$failures" -gt 0 ]; then
  echo "$failures check(s) failed"
  exit 1
fi
echo "All checks passed"
