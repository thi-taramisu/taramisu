"""Shared routing, webhook transport, and GitHub delivery checkpoints."""

import base64
import json
import os
import re
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from urllib.parse import urlencode, urlsplit

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
WEBHOOK_TIMEOUT_SECONDS = 20
ISSUE_COLOR = 0x5865F2
PR_COLOR = 0x5865F2
MERGED_COLOR = 0x3BA55C
LABEL_COLOR = 0xC99A45
NO_MENTIONS = {"parse": [], "users": [], "roles": [], "replied_user": False}


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


def display_text(value):
    """Keep GitHub text on one line and escape Discord Markdown."""
    return re.sub(r"([\\`*_{}\[\]()<>~|])", r"\\\1", " ".join(value.split()))


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


STATE_BRANCH = "automation/discord-issue-digest-state"
STATE_PATH = "discord-issue-digest.json"


def timestamp(value):
    return value.isoformat(timespec="seconds").replace("+00:00", "Z")


class GitHub:
    def __init__(self):
        self.root = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}"
        self.token = os.environ["GH_TOKEN"]
        self.sha = None

    def request(self, path, data=None, method=None, *, root=None):
        request = urllib.request.Request(
            (root or self.root) + path,
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
            state = {"version": 1, "initial_since": initial_since, "channels": {}}
            # Publish the branch only when its checkpoint file already exists.
            # Interrupted setup leaves no half-initialized branch and can retry.
            parent = os.environ["GITHUB_SHA"]
            base = self.request(f"/git/commits/{parent}")
            tree = self.request("/git/trees", {
                "base_tree": base["tree"]["sha"],
                "tree": [{"path": STATE_PATH, "mode": "100644", "type": "blob",
                          "content": json.dumps(state, sort_keys=True)}],
            })
            commit = self.request("/git/commits", {
                "message": "Initialize Discord notification checkpoints",
                "tree": tree["sha"], "parents": [parent],
            })
            self.request("/git/refs", {"ref": f"refs/heads/{STATE_BRANCH}", "sha": commit["sha"]})
            self.sha = next(entry["sha"] for entry in tree["tree"] if entry["path"] == STATE_PATH)
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

    def approved_pulls(self, labels):
        repo = os.environ["GITHUB_REPOSITORY"]
        query = f'repo:{repo} is:pr is:open review:approved label:{",".join(labels)}'
        result = self.request("/search/issues?" + urlencode({"q": query, "per_page": 8}),
                              root="https://api.github.com")
        search_url = f"https://github.com/{repo}/pulls?" + urlencode({"q": query})
        return result["items"], result["total_count"], search_url

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
