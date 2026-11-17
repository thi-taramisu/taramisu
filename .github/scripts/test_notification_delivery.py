"""Essential delivery regressions; no network requests."""

import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch

from discord_issue_digest import deliver_digest
from discord_notifications import DeliveryError
from discord_pr_notifications import deliver_pr
from test_discord_notifications import event_payload

ENV = {"DISCORD_BACKEND_WEBHOOK": "channel", "DISCORD_DEVOPS_WEBHOOK": "channel"}


class DeliveryTests(unittest.TestCase):
    @patch("discord_issue_digest.send_webhook")
    def test_digest_routes_without_duplicates_or_pings(self, send):
        item = dict(event_payload(labels=["backend", "IAM"])["issue"], created_at="2026-11-17T10:00:00Z")
        github = Mock()
        github.load.return_value = {"initial_since": "2026-11-17T09:00:00Z", "channels": {}}
        github.issues.return_value = [item, item, dict(item, number=43, pull_request={})]
        now = datetime(2026, 11, 17, 19, tzinfo=timezone.utc)
        deliver_digest(github, ENV, now)
        send.assert_called_once()
        payload = send.call_args.args[1]
        self.assertEqual(len(payload["embeds"]), 1)
        self.assertEqual(payload["allowed_mentions"], {
            "parse": [], "users": [], "roles": [], "replied_user": False})
        send.reset_mock()
        deliver_digest(github, ENV, now)
        send.assert_not_called()

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
            github.request.return_value.update(state="closed", merged=True)
            event = dict(event, action="closed", pull_request=github.request.return_value)
            deliver_pr(github, event, ENV)
            deliver_pr(github, event, ENV)
            self.assertEqual(send.call_count, 2)
            self.assertTrue(send.call_args.args[1]["embeds"][0]["title"].startswith("🎉 PR merged"))

    @patch("discord_pr_notifications.send_webhook")
    def test_failed_pr_delivery_is_retried(self, send):
        github = Mock()
        github.load.return_value = {}
        event = event_payload("pull_request_target", labels=["backend"])
        github.request.return_value = dict(event["pull_request"], state="open")
        send.side_effect = DeliveryError("unavailable")
        with self.assertRaises(DeliveryError):
            deliver_pr(github, event, ENV)
        github.save.assert_not_called()
        send.reset_mock(side_effect=True)
        deliver_pr(github, event, ENV)
        send.assert_called_once()
