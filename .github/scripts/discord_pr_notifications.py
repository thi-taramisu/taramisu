"""Announce each PR once per destination, and its merge separately."""

import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from discord_notifications import (
    DeliveryError, GitHub, LABEL_WEBHOOKS, NO_MENTIONS, PR_COLOR, MERGED_COLOR, LABEL_COLOR,
    destinations, display_text, send_webhook, timestamp,
)


def pr_payload(event):
    item = event["pull_request"]
    is_merged = event["action"] == "closed"
    action = "merged" if is_merged else "opened" if event["action"] == "opened" else "labeled"
    actor = event.get("sender", {}).get("login") or item["user"]["login"]
    title = display_text(item["title"])[:256].rstrip("\\")
    context = []
    if action == "labeled":
        label = event["label"]["name"].replace("`", "'")
        context.append(f"Added `{label}`")
    base = item.get("base", {}).get("ref")
    if base and base != "main":
        base = base.replace("`", "'")[:250]
        context.append(f"Into `{base}`")
    embed = {
        "title": f"{action.capitalize()} · PR #{item['number']}",
        "url": item["html_url"],
        "description": "\n".join([title, " · ".join(context)]).rstrip(),
        "footer": {"text": f"by {actor}"},
        "color": MERGED_COLOR if is_merged else LABEL_COLOR if action == "labeled" else PR_COLOR,
    }
    return {"allowed_mentions": NO_MENTIONS, "embeds": [embed]}


def deliver_pr(github, event, environ):
    if event.get("action") not in ("opened", "labeled", "closed"):
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
        keys = set(LABEL_WEBHOOKS[label] for label in routed_labels)
        legacy_key = hashlib.sha256(webhook.encode()).hexdigest()
        if keys.intersection(sent) or legacy_key in sent:
            # Preserve old receipts and aliases for routes sharing one webhook.
            if keys.difference(sent):
                sent.extend(sorted(keys.difference(sent)))
                github.save(state)
            continue
        try:
            send_webhook(webhook, pr_payload(event))
        except DeliveryError:
            print("PR delivery failed for: " + ", ".join(routed_labels), file=sys.stderr)
            failed = True
            continue
        sent.extend(sorted(keys))
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
