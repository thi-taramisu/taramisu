"""Deliver new-issue digests with checkpoints on a dedicated GitHub state branch."""

import base64
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from discord_notifications import DeliveryError, ISSUE_COLOR, LABEL_WEBHOOKS, NoRedirect, destinations, display_text, send_webhook

STATE_BRANCH = "automation/discord-issue-digest-state"
STATE_PATH = "discord-issue-digest.json"


def timestamp(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


class GitHub:
    def __init__(self):
        self.root = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}"
        self.token = os.environ["GH_TOKEN"]
        self.sha = None

    def request(self, path, data=None, method=None):
        request = urllib.request.Request(
            self.root + path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={"Authorization": f"Bearer {self.token}", "Accept": "application/vnd.github+json",
                     "Content-Type": "application/json", "User-Agent": "Taramisu-Issue-Digest"},
            method=method,
        )
        with urllib.request.build_opener(NoRedirect).open(request, timeout=30) as response:
            return json.load(response)

    def load(self, initial_since):
        try:
            result = self.request(f"/contents/{STATE_PATH}?{urlencode({'ref': STATE_BRANCH})}")
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            # Only initialize a missing branch. A missing file on an existing branch
            # is an error, not permission to replay old notifications.
            try:
                self.request(f"/git/ref/heads/{STATE_BRANCH}")
            except urllib.error.HTTPError as ref_error:
                if ref_error.code != 404:
                    raise
            else:
                raise ValueError("Digest state file is missing from the existing state branch")
            self.request("/git/refs", {"ref": f"refs/heads/{STATE_BRANCH}", "sha": os.environ["GITHUB_SHA"]})
            state = {"version": 1, "initial_since": initial_since, "channels": {}}
            self.save(state)
            return state
        self.sha = result["sha"]
        state = json.loads(base64.b64decode(result["content"]))
        if state["version"] != 1:
            raise ValueError("Unsupported digest state version")
        return state

    def save(self, state):
        data = {"message": "Update Discord issue digest checkpoint", "branch": STATE_BRANCH,
                "content": base64.b64encode(json.dumps(state, sort_keys=True).encode()).decode()}
        if self.sha:
            data["sha"] = self.sha
        self.sha = self.request(f"/contents/{STATE_PATH}", data, "PUT")["content"]["sha"]

    def issues(self, since, until):
        # GitHub filters updated_at strictly after since; overlap one second
        # so an issue created exactly at our inclusive boundary is not lost.
        api_since = timestamp(datetime.fromisoformat(since.replace("Z", "+00:00")) - timedelta(seconds=1))
        page = 1
        while True:
            items = self.request("/issues?" + urlencode({
                "state": "all", "sort": "created", "direction": "desc", "since": api_since,
                "per_page": 100, "page": page,
            }))
            for item in items:
                if "pull_request" not in item and since <= item["created_at"] < until:
                    yield item
            if len(items) < 100 or items[-1]["created_at"] < since:
                return
            page += 1


def digest_batches(issues, now=None):
    """One compact list per batch, within Discord's description limit."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone.utc)
    heading = "Morning issue digest" if now.hour < 12 else "Evening issue digest"
    pending = list(issues)
    while pending:
        batch, lines = [], []
        while pending and len(batch) < 10:
            item = pending[0]
            title = display_text(item["title"]).replace("\\[", "[").replace("\\]", "]")[:180].rstrip("\\")
            line = f"[#{item['number']}]({item['html_url']}) · {title}"
            if lines and len("\n\n".join([*lines, line])) > 4096:
                break
            batch.append(pending.pop(0))
            lines.append(line)
        yield batch, {
            "allowed_mentions": {"parse": [], "users": [], "roles": [], "replied_user": False},
            "embeds": [{"title": f"{heading} ({len(batch)} new {'issue' if len(batch) == 1 else 'issues'})",
                        "description": "\n\n".join(lines), "color": ISSUE_COLOR}],
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
