"""Deliver twice-daily issue digests using persisted channel checkpoints."""

import hashlib
import os
import sys
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from discord_notifications import (
    DeliveryError, GitHub, ISSUE_COLOR, LABEL_WEBHOOKS, NO_MENTIONS,
    destinations, display_text, send_webhook, timestamp, warn_delivery,
)


def digest_line(item):
    title = display_text(item["title"]).replace("\\[", "[").replace("\\]", "]")[:180].rstrip("\\")
    return f"[#{item['number']}]({item['html_url']}) · {title}"


def digest_batches(issues, now=None, pr_section=""):
    """One compact list per batch, within Discord's description limit."""
    now = (now or datetime.now(timezone.utc)).astimezone(ZoneInfo("Europe/Berlin"))
    heading = "☀️ Morning issue digest" if now.hour < 12 else "🌙 Evening issue digest"
    pending = list(issues)
    while pending:
        batch, lines = [], []
        while pending and len(batch) < 10:
            item = pending[0]
            line = digest_line(item)
            count = len(batch) + 1
            noun = "issue" if count == 1 else "issues"
            title = f"**{heading} ({count} new {noun})**"
            description = "\n".join([title, "", *lines, line]) + pr_section
            if lines and len(description) > 4096:
                break
            batch.append(pending.pop(0))
            lines.append(line)
            batch_description = description
        yield batch, {
            "allowed_mentions": NO_MENTIONS,
            "embeds": [{"description": batch_description, "color": ISSUE_COLOR}],
        }
        pr_section = ""


def deliver_digest(github, environ, now):
    until = timestamp(now)
    state = github.load(timestamp(now - timedelta(days=1)))
    routed = destinations(LABEL_WEBHOOKS, environ)
    channels = []
    for webhook, labels in routed.items():
        # Secret names identify routes even when their webhook URLs change.
        # Copy any old URL-based checkpoint on the first run after upgrading.
        legacy = state["channels"].get(hashlib.sha256(webhook.encode()).hexdigest(),
                                       {"since": state["initial_since"], "sent": []})
        checkpoints = {}
        for label in labels:
            key = LABEL_WEBHOOKS[label]
            checkpoints[key] = state["channels"].setdefault(
                key, {"since": legacy["since"], "sent": list(legacy["sent"])})
        channels.append((webhook, labels, checkpoints))
    if not channels:
        print("No configured digest destinations.")
        return
    since = min(checkpoint["since"] for _, _, checkpoints in channels for checkpoint in checkpoints.values())
    # Deduplicate API results and exclude PRs defensively, including on retries.
    issues = {item["number"]: item for item in github.issues(since, until) if "pull_request" not in item}
    for webhook, labels, checkpoints in channels:
        pending = sorted((item for item in issues.values()
                          if any(label["name"] in labels
                                 and checkpoints[LABEL_WEBHOOKS[label["name"]]]["since"] <= item["created_at"] < until
                                 and item["number"] not in checkpoints[LABEL_WEBHOOKS[label["name"]]]["sent"]
                                 for label in item["labels"])),
                         key=lambda item: (item["created_at"], item["number"]))
        pr_section = ""
        if pending:
            try:
                pulls, total, url = github.approved_pulls(labels)
            except (OSError, ValueError, KeyError):
                print("Approved PR lookup failed; sending issue digest.", file=sys.stderr)
            else:
                if pulls:
                    lines = ["", "", "**🕒 Approved PRs awaiting merge**", ""]
                    lines.extend(digest_line(pull) for pull in pulls)
                    if total > len(pulls):
                        lines.append(f"[View all {total} approved PRs]({url})")
                    pr_section = "\n".join(lines)
        for batch, payload in digest_batches(pending, now, pr_section):
            try:
                send_webhook(webhook, payload)
            except DeliveryError as error:
                warn_delivery(labels, error)
                break
            for checkpoint in checkpoints.values():
                checkpoint["sent"].extend(item["number"] for item in batch)
            # A state-write failure must stop the run immediately.
            github.save(state)
        else:
            for checkpoint in checkpoints.values():
                checkpoint.update(since=until, sent=[])
            github.save(state)
            print(f"Delivered {len(pending)} new issues for {', '.join(labels)}.")


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
