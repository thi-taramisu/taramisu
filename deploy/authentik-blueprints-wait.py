"""Waits until Authentik has applied its own blueprints. dev.sh and taramisu-ctl.sh feed this file to "ak shell".

Authentik's worker applies its bundled blueprints after it starts: all of them on a first start, the changed ones
after an upgrade. Applied after ours, they reset what ours change, for example the login title that branding.yaml
sets (#344). The scripts therefore wait here before they apply authentik-blueprints.txt.
"""

import sys
import time

from django_dramatiq_postgres.models import TaskState

from authentik.blueprints.models import BlueprintInstance, BlueprintInstanceStatus
from authentik.blueprints.v1.labels import LABEL_AUTHENTIK_INSTANTIATE
from authentik.blueprints.v1.tasks import apply_blueprint, blueprints_discovery, blueprints_find
from authentik.tasks.models import Task

TIMEOUT_SECONDS = 300


def pending_files():
    """Blueprint files that Authentik will still apply, by the rule of its own discovery task."""
    paths = []
    for blueprint in blueprints_find():
        labels = blueprint.meta.labels if blueprint.meta else {}
        if labels.get(LABEL_AUTHENTIK_INSTANTIATE, "").lower() == "false":
            continue  # Ours: the scripts apply them, Authentik never does.
        instance = BlueprintInstance.objects.filter(path=blueprint.path).first()
        if instance is None:
            paths.append(blueprint.path)  # Discovery has not seen the file yet.
        elif not instance.enabled or instance.status == BlueprintInstanceStatus.ERROR:
            continue  # Authentik skips it, or it tried and failed; waiting ends neither.
        elif instance.status == BlueprintInstanceStatus.UNKNOWN or instance.last_applied_hash != blueprint.hash:
            paths.append(blueprint.path)  # Never applied, or the file changed since.
    return paths


def unfinished_tasks():
    """Blueprint tasks that the worker has queued or is running.

    Authentik starts its discovery more than once while it starts, so a blueprint can be queued a second time
    and be applied again after its file already counts as applied.
    """
    actors = (blueprints_discovery.actor_name, apply_blueprint.actor_name)
    return Task.objects.filter(actor_name__in=actors).exclude(state__in=(TaskState.DONE, TaskState.REJECTED)).count()


deadline = time.monotonic() + TIMEOUT_SECONDS
while True:
    files, tasks = pending_files(), unfinished_tasks()
    if not files and not tasks:
        break
    if time.monotonic() > deadline:
        print(f"Authentik is not done after {TIMEOUT_SECONDS} s: {tasks} unfinished blueprint tasks, "
              f"blueprints not applied: {', '.join(sorted(files)) or 'none'}", file=sys.stderr)
        raise SystemExit(1)
    time.sleep(2)
