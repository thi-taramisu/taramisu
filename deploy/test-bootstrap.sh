#!/bin/sh
# Simulates the VM in a throwaway Docker-in-Docker container and runs taramisu-ctl.sh in it.
# Like the host setup in deploy/README.md, a "taramisu" user in the docker group owns a real Git clone
# in /opt/taramisu. The clone has all release tags plus three test releases made from the current working tree:
# v99.0.0, v99.0.1 (no changes) and v99.0.2 (same commit as v99.0.1), followed by one commit that is not a release,
# as on a fresh clone of main.
# The test releases have no published images, so the api, frontend and docs images use the tag "latest".
#
#   deploy/test-bootstrap.sh                 # run taramisu-ctl.sh (installs the newest release, v99.0.2)
#   deploy/test-bootstrap.sh sh              # open a shell as taramisu in /opt/taramisu instead
#   deploy/test-bootstrap.sh <command ...>   # run any other command as taramisu in /opt/taramisu
set -eu
cd "$(dirname "$0")/.."

if [ "$#" -eq 0 ]; then
    set -- deploy/taramisu-ctl.sh
fi
tty=
if [ -t 0 ] && [ -t 1 ]; then
    tty=-t
fi

# /var/lib/docker gets its own anonymous volume: the inner Docker cannot put overlays on the container's overlay.
container=$(docker run -d --rm --privileged -e DOCKER_TLS_CERTDIR= -v /var/lib/docker docker:29-dind)
trap 'docker rm -f "$container" > /dev/null 2>&1 || true' EXIT INT TERM
as_root() { docker exec -i "$container" "$@"; }
as_taramisu() { docker exec -i -u taramisu -w /opt/taramisu -e TARAMISU_IMAGE_TAG=latest "$container" "$@"; }

tries=0
until as_root docker info > /dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -le 60 ] || { echo 'Docker in the test container did not start' >&2; exit 1; }
    sleep 1
done

# Host setup: tools and a user whose only extra right is Docker access.
as_root apk add --no-cache --quiet curl
as_root adduser -D -G docker taramisu
as_root sh -c 'mkdir /opt/taramisu && chown taramisu:docker /opt/taramisu'

# Real clone with history and tags; its origin is a bundle, so "git fetch --tags origin" works offline.
git bundle create - HEAD --tags 2> /dev/null | as_root sh -c 'cat > /tmp/taramisu.bundle && chmod 644 /tmp/taramisu.bundle'
as_taramisu git -c advice.detachedHead=false clone --quiet /tmp/taramisu.bundle /opt/taramisu
# Replace the tracked files with the working tree (also uncommitted changes); plain tar options, so bsdtar (macOS) works.
as_taramisu sh -c 'git ls-files -z | xargs -0 rm -f'
git ls-files -z --cached --others --exclude-standard \
    | tar --null -T - -cf - \
    | as_taramisu tar -xf - -C /opt/taramisu
as_taramisu sh -c '
    set -e
    commit() { git -c user.name=test -c user.email=test@localhost commit --quiet --allow-empty -m "$1"; }
    git add -A
    commit "Test release"
    git tag v99.0.0
    commit "Test release without changes"
    git tag v99.0.1
    git tag v99.0.2
    commit "Not a release"
'

docker exec -i $tty -u taramisu -w /opt/taramisu -e TARAMISU_IMAGE_TAG=latest "$container" "$@"
