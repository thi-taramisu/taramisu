"""Deliver twice-daily issue digests using persisted channel checkpoints."""

import hashlib
import os
import sys
from datetime import datetime, timedelta, timezone

from discord_notifications import (
    DeliveryError, GitHub, ISSUE_COLOR, LABEL_WEBHOOKS, NO_MENTIONS,
    destinations, display_text, send_webhook, timestamp,
)


def digest_batches(issues, now=None):
    """One compact list per batch, within Discord's description limit."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    heading = "☀️ Morning issue digest" if now.hour < 12 else "🌙 Evening issue digest"
    pending = list(issues)
    while pending:
        batch, lines = [], []
        while pending and len(batch) < 10:
            item = pending[0]
            title = display_text(item["title"]).replace("\\[", "[").replace("\\]", "]")[:180].rstrip("\\")
            line = f"[#{item['number']}]({item['html_url']}) · {title}"
            if lines and len("\n".join([*lines, line])) > 4096:
                break
            batch.append(pending.pop(0))
            lines.append(line)
        yield batch, {
            "allowed_mentions": NO_MENTIONS,
            "embeds": [{"author": {"name": f"{heading} ({len(batch)} new {'issue' if len(batch) == 1 else 'issues'})"},
                        "description": "\n".join(lines), "color": ISSUE_COLOR}],
        }


def deliver_digest(github, environ, now):
    until = timestamp(now)
    state = github.load(timestamp(now - timedelta(days=1)))
    routed = destinations(LABEL_WEBHOOKS, environ)
    channels = []
    for webhook, labels in routed.items():
        key = hashlib.sha256(webhook.encode()).hexdigest()
        checkpoint = state["channels"].setdefault(key, {"since": state["initial_since"], "sent": []})
        channels.append((webhook, labels, checkpoint))
    if not channels:
        print("No configured digest destinations.")
        return
    since = min(checkpoint["since"] for _, _, checkpoint in channels)
    # Deduplicate API results and exclude PRs defensively, including on retries.
    issues = {item["number"]: item for item in github.issues(since, until) if "pull_request" not in item}
    failed = False
    for webhook, labels, checkpoint in channels:
        pending = sorted((item for item in issues.values()
                          if checkpoint["since"] <= item["created_at"] < until
                          and item["number"] not in checkpoint["sent"]
                          and set(labels).intersection(label["name"] for label in item["labels"])),
                         key=lambda item: (item["created_at"], item["number"]))
        try:
            for batch, payload in digest_batches(pending, now):
                send_webhook(webhook, payload)
                checkpoint["sent"].extend(item["number"] for item in batch)
                # A state-write failure must stop the run immediately.
                github.save(state)
            checkpoint.update(since=until, sent=[])
            github.save(state)
            print(f"Delivered {len(pending)} new issues for {', '.join(labels)}.")
        except DeliveryError:
            print(f"Discord delivery failed for {', '.join(labels)}; checkpoint retained.", file=sys.stderr)
            failed = True
    if failed:
        raise DeliveryError("Some digest destinations failed")


def main():
    try:
        deliver_digest(GitHub(), os.environ, datetime.now(timezone.utc))
        return 0
    except (DeliveryError, OSError, ValueError, KeyError, TypeError):
        # Do not print request objects, tokens, webhook URLs, or API bodies.
        print("Issue digest failed; check API permissions, state branch, and webhook availability.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
