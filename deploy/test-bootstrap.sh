#!/bin/sh
# Simulates a blank Debian VM in a throwaway container and runs the bootstrap in it.
# The container is privileged because Docker runs inside it (Docker in Docker).
# Only files Git would commit are copied in, so local .env files and node_modules stay out.
#
#   deploy/test-bootstrap.sh                 # run taramisu-ctl.sh --bootstrap
#   deploy/test-bootstrap.sh sh              # open a shell in the fresh "VM" instead
#   deploy/test-bootstrap.sh <command ...>   # run any other command in the repository copy (/opt)
set -eu
cd "$(dirname "$0")/.."

image=${TEST_IMAGE:-debian:trixie}
if [ "$#" -eq 0 ]; then
    set -- deploy/taramisu-ctl.sh --bootstrap
fi
tty=
if [ -t 0 ] && [ -t 1 ]; then
    tty=-t
fi

# /var/lib/docker gets its own anonymous volume: the inner Docker cannot put overlays on the container's overlay.
container=$(docker create -i $tty --rm --privileged -v /var/lib/docker -w /opt "$image" "$@")
trap 'docker rm -f "$container" > /dev/null 2>&1 || true' EXIT INT TERM
# The repository goes straight to /opt; plain tar options only, so bsdtar (macOS) works as well.
git ls-files -z --cached --others --exclude-standard \
    | tar --null -T - -cf - \
    | docker cp - "$container":/opt
docker start -a -i "$container"
