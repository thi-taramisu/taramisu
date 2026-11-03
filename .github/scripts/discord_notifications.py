"""Route GitHub events to Discord; local invocations default to a dry run."""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

# Configuration: add labels here and expose their secrets in the workflow's env.
# Webhook URLs belong in environment variables / GitHub secrets
LABEL_WEBHOOKS = {
    "backend": "DISCORD_BACKEND_WEBHOOK",
    "frontend": "DISCORD_FRONTEND_WEBHOOK",
    "devops": "DISCORD_DEVOPS_WEBHOOK",
    "IAM": "DISCORD_DEVOPS_WEBHOOK",
    "infrastructure": "DISCORD_DEVOPS_WEBHOOK",
    "CI/CD": "DISCORD_DEVOPS_WEBHOOK",
}
LABEL_ROLES = {
    "backend": "1563190105974513765",
    "frontend": "1563190563342258296",
    "CI/CD": "1563190406554984498",
    "infrastructure": "1563190449810833448",
    "IAM": "1563190604408553522",
}
WEBHOOK_TIMEOUT_SECONDS = 20
ISSUE_COLOR = 0x238636
PR_COLOR = 0x8957E5


def event_item(event_name, event):
    if event_name not in ("issues", "pull_request_target"):
        return None
    if event.get("action") not in ("opened", "labeled", "closed"):
        return None
    key = "issue" if event_name == "issues" else "pull_request"
    item = event.get(key)
    if not isinstance(item, dict) or (key == "issue" and "pull_request" in item):
        return None
    if event["action"] == "closed" and (key != "pull_request" or item.get("merged") is not True):
        return None
    return item


def matching_labels(event_name, event):
    item = event_item(event_name, event)
    if item is None:
        return []
    labels = ([event.get("label", {})] if event["action"] == "labeled"
              else item.get("labels", []))
    return list(dict.fromkeys(
        label.get("name") for label in labels if label.get("name") in LABEL_WEBHOOKS
    ))


def destinations(labels, environ):
    """Group labels by URL so two secrets pointing to one channel send once."""
    grouped = {}
    for label in labels:
        secret = LABEL_WEBHOOKS[label]
        webhook = environ.get(secret, "").strip()
        if not webhook:
            print(f"Skipping {label}: {secret} is not configured.")
            continue
        grouped.setdefault(webhook, []).append(label)
    return grouped


def embed_payload(event_name, event, labels):
    item = event_item(event_name, event)
    is_issue = event_name == "issues"
    is_merged = event["action"] == "closed"
    kind = "🐛 Issue" if is_issue else "🔀 PR"
    if is_merged:
        kind = "🎉 PR merged"
    actor = event.get("sender", {}).get("login") or item["user"]["login"]
    if event["action"] == "opened":
        description = f"`{actor}` opened {'an issue' if is_issue else 'a pull request'}"
    elif is_merged:
        description = f"`{actor}` merged this pull request. Great work, team! 🥳"
    else:
        label = event["label"]["name"].replace("`", "'")
        description = f"`{actor}` added `{label}`"
    fields = []
    footer_parts = ["GitHub", *[f"[{label}]" for label in labels]]
    if not is_issue:
        head = item.get("head", {}).get("ref")
        base = item.get("base", {}).get("ref")
        if head and base:
            branches = f"{head} → {base}".replace("`", "'")[:1022]
            fields.append({"name": "Branches", "value": f"`{branches}`"})
    embed = {
        "title": f"{kind} #{item['number']} · {item['title']}"[:256],
        "url": item["html_url"],
        "description": description,
        "color": ISSUE_COLOR if is_issue else PR_COLOR,
        "fields": fields,
        "footer": {
            "text": " · ".join(footer_parts),
            "icon_url": "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        },
    }
    timestamp_key = "merged_at" if is_merged else "created_at" if event["action"] == "opened" else "updated_at"
    timestamp = item.get(timestamp_key)
    if timestamp:
        local_time = datetime.fromisoformat(timestamp.replace("Z", "+00:00")).astimezone(ZoneInfo("Europe/Berlin"))
        footer_parts.append(local_time.strftime("%d.%m.%Y · %H:%M"))
        embed["footer"]["text"] = " · ".join(footer_parts)
    roles = list(dict.fromkeys(
        LABEL_ROLES[label] for label in labels if LABEL_ROLES.get(label)
    )) if is_issue else []
    payload = {
        "allowed_mentions": {"parse": [], "users": [], "roles": roles, "replied_user": False},
        "embeds": [embed],
    }
    if roles:
        payload["content"] = " ".join(f"<@&{role}>" for role in roles)
    return payload


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class DeliveryError(Exception):
    pass


def send_webhook(webhook, payload):
    try:
        parsed = urlsplit(webhook)
    except ValueError:
        raise DeliveryError("Invalid Discord webhook URL; use the channel's copied discord.com webhook URL.") from None
    if (parsed.scheme != "https" or parsed.netloc != "discord.com"
            or not re.fullmatch(r"/api(?:/v\d+)?/webhooks/\d+/[A-Za-z0-9._-]+", parsed.path)
            or parsed.query or parsed.fragment):
        raise DeliveryError("Invalid Discord webhook URL; use the channel's copied discord.com webhook URL.")
    request = urllib.request.Request(
        webhook + "?wait=true",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "User-Agent": "Taramisu-GitHub-Notifications/1.0"},
        method="POST",
    )
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=WEBHOOK_TIMEOUT_SECONDS) as response:
            if not 200 <= response.status < 300:
                raise DeliveryError(f"Discord returned HTTP {response.status}.")
    except urllib.error.HTTPError as error:
        raise DeliveryError(f"Discord returned HTTP {error.code}; check webhook access or rate limits.") from None
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        raise DeliveryError("Discord delivery failed due to a network, TLS, or timeout error.") from None


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event-name", default=os.environ.get("GITHUB_EVENT_NAME"))
    parser.add_argument("--event-path", default=os.environ.get("GITHUB_EVENT_PATH"), type=Path)
    parser.add_argument("--deliver", action="store_true", help="Send real messages using environment webhook URLs")
    args = parser.parse_args(argv)
    if not args.event_name or not args.event_path:
        parser.error("Supply --event-name and --event-path, or GitHub's event environment variables.")
    try:
        event = json.loads(args.event_path.read_text(encoding="utf-8"))
        labels = matching_labels(args.event_name, event)
        if not args.deliver:
            print("Dry run; matching destinations: " + (", ".join(LABEL_WEBHOOKS[label] for label in labels) or "none"))
            return 0
        failed = False
        for webhook, routed_labels in destinations(labels, os.environ).items():
            try:
                send_webhook(webhook, embed_payload(args.event_name, event, routed_labels))
                print("Delivered notification for: " + ", ".join(routed_labels))
            except DeliveryError as error:
                print(f"Delivery failed for {', '.join(routed_labels)}: {error}", file=sys.stderr)
                failed = True
        return 1 if failed else 0
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        print("Cannot process event: check the event file and required GitHub payload fields.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
