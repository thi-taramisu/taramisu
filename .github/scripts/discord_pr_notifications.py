"""Announce each PR once per destination, and its merge separately."""

import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from discord_issue_digest import GitHub, timestamp
from discord_notifications import DeliveryError, LABEL_WEBHOOKS, destinations, embed_payload, event_item, send_webhook


def deliver_pr(github, event, environ):
    if event_item("pull_request_target", event) is None:
        return
    number = event["pull_request"]["number"]
    item = github.request(f"/pulls/{number}")
    # A queued creation/label event must not announce an already closed PR.
    merged = event["action"] == "closed"
    if (merged and item.get("merged") is not True) or (not merged and item["state"] != "open"):
        return
    event = dict(event, pull_request=item)
    labels = list(dict.fromkeys(label["name"] for label in item["labels"] if label["name"] in LABEL_WEBHOOKS))
    routed = destinations(labels, environ)
    if not routed:
        return
    state = github.load(timestamp(datetime.now(timezone.utc) - timedelta(days=1)))
    sent = state.setdefault("prs", {}).setdefault(f"{number}:{'merged' if merged else 'announced'}", [])
    failed = False
    for webhook, routed_labels in routed.items():
        key = hashlib.sha256(webhook.encode()).hexdigest()
        if key in sent:
            continue
        try:
            send_webhook(webhook, embed_payload("pull_request_target", event, routed_labels))
        except DeliveryError:
            print("PR delivery failed for: " + ", ".join(routed_labels), file=sys.stderr)
            failed = True
            continue
        sent.append(key)
        # Stop immediately if recording a successful delivery fails.
        github.save(state)
    if failed:
        raise DeliveryError("Some PR destinations failed")


def main():
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        deliver_pr(GitHub(), event, os.environ)
        return 0
    except (DeliveryError, OSError, ValueError, KeyError, TypeError):
        print("PR notification failed; check API permissions, checkpoint state, and webhooks.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
