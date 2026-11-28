"""Essential delivery regressions; no network requests."""

import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from discord_issue_digest import deliver_digest
from discord_notifications import DeliveryError
from discord_pr_notifications import deliver_pr

ENV = {"DISCORD_BACKEND_WEBHOOK": "channel", "DISCORD_DEVOPS_WEBHOOK": "channel"}


def event_payload(event_name="issues", labels=None):
    item = {"number": 42, "title": "Check @everyone <@123> <@&999>",
            "html_url": "https://github.com/example/repo/issues/42",
            "user": {"login": "author"}, "labels": [{"name": label} for label in labels or []],
            "base": {"ref": "main"}}
    return {"action": "opened", "issue" if event_name == "issues" else "pull_request": item,
            "label": {"name": "IAM"}}


class DeliveryTests(unittest.TestCase):
    @patch("discord_issue_digest.send_webhook")
    def test_digest_routes_without_duplicates_or_pings(self, send):
        item = dict(event_payload(labels=["backend", "IAM"])["issue"], created_at="2026-11-17T10:00:00Z")
        github = Mock()
        github.load.return_value = {"initial_since": "2026-11-17T09:00:00Z", "channels": {}}
        github.issues.return_value = [item, item, dict(item, number=43, pull_request={})]
        github.approved_pulls.return_value = ([dict(item, number=54)], 9, "https://github.com/example/repo/pulls")
        now = datetime(2026, 11, 17, 19, tzinfo=timezone.utc)
        deliver_digest(github, ENV, now)
        send.assert_called_once()
        payload = send.call_args.args[1]
        embed, = payload["embeds"]
        self.assertTrue(embed["description"].startswith("**🌙 Evening issue digest (1 new issue)**\n\n"))
        issues, pulls = embed["description"].split("\n\n**🕒 Approved PRs awaiting merge**\n\n")
        self.assertIn("[#42]", issues)
        self.assertIn("[#54]", pulls)
        self.assertIn("View all 9", pulls)
        self.assertEqual(payload["allowed_mentions"], {
            "parse": [], "users": [], "roles": [], "replied_user": False})
        send.reset_mock()
        deliver_digest(github, ENV, now)
        send.assert_not_called()
        github.approved_pulls.assert_called_once()

    @patch("discord_issue_digest.send_webhook")
    def test_failed_digest_warns_and_preserves_only_failed_route(self, send):
        github = Mock()
        since = "2026-11-17T09:00:00Z"
        github.load.return_value = {"initial_since": since, "channels": {}}
        item = event_payload(labels=["backend", "frontend"])["issue"]
        github.issues.return_value = [dict(item, created_at=since)]
        github.approved_pulls.return_value = ([], 0, "")
        env = {"DISCORD_BACKEND_WEBHOOK": "one", "DISCORD_FRONTEND_WEBHOOK": "two"}
        send.side_effect = [DeliveryError("unavailable"), None]
        with patch("builtins.print") as log:
            deliver_digest(github, env, datetime(2026, 11, 17, 19, tzinfo=timezone.utc))
        log.assert_any_call("::warning title=Discord notification undelivered::backend: unavailable")
        channels = github.load.return_value["channels"]
        self.assertEqual(channels["DISCORD_BACKEND_WEBHOOK"], {"since": since, "sent": []})
        self.assertEqual(channels["DISCORD_FRONTEND_WEBHOOK"]["since"], "2026-11-17T19:00:00Z")

    @patch("discord_pr_notifications.send_webhook")
    def test_pr_overlap_and_merge_are_each_announced_once(self, send):
        for actions in (("opened", "labeled"), ("labeled", "opened")):
            github = Mock()
            github.load.return_value = {}
            event = event_payload("pull_request_target", labels=["backend", "IAM"])
            github.request.return_value = dict(event["pull_request"], state="open")
            send.reset_mock()
            for action in actions:
                deliver_pr(github, dict(event, action=action), ENV)
            send.assert_called_once()
            self.assertEqual(send.call_args.args[1]["allowed_mentions"]["roles"], [])
            self.assertNotIn("content", send.call_args.args[1])
            github.request.return_value.update(state="closed", merged=True)
            event = dict(event, action="closed", pull_request=github.request.return_value)
            deliver_pr(github, event, ENV)
            deliver_pr(github, event, ENV)
            self.assertEqual(send.call_count, 2)
            self.assertEqual(send.call_args.args[1]["embeds"][0]["title"], "Merged · PR #42")

    @patch("discord_pr_notifications.send_webhook")
    def test_failed_pr_delivery_is_retried(self, send):
        github = Mock()
        github.load.return_value = {}
        event = event_payload("pull_request_target", labels=["backend"])
        github.request.return_value = dict(event["pull_request"], state="open")
        send.side_effect = DeliveryError("unavailable")
        with patch("builtins.print") as log:
            deliver_pr(github, event, ENV)
        log.assert_any_call("::warning title=Discord notification undelivered::backend: unavailable")
        github.save.assert_not_called()
        send.reset_mock(side_effect=True)
        deliver_pr(github, event, ENV)
        send.assert_called_once()

    @patch("discord_pr_notifications.send_webhook")
    def test_closed_unmerged_and_unrouted_prs_are_silent(self, send):
        github = Mock()
        event = event_payload("pull_request_target", labels=["backend"])
        github.request.return_value = dict(event["pull_request"], state="closed", merged=False)
        deliver_pr(github, dict(event, action="closed"), ENV)
        github.request.return_value = dict(event["pull_request"], state="open", labels=[{"name": "unknown"}])
        deliver_pr(github, event, ENV)
        send.assert_not_called()
        github.load.assert_not_called()
