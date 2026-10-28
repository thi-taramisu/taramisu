"""Offline regression tests for label routing and issue role mentions."""

import unittest
from pathlib import Path
from unittest.mock import patch

from discord_notifications import LABEL_ROLES, destinations, embed_payload, matching_labels


def event_payload(event_name="issues", action="opened", labels=None, added_label="IAM"):
    item = {
        "number": 42,
        "title": "Check @everyone <@123> <@&999>",
        "html_url": "https://github.com/example/repo/issues/42",
        "user": {"login": "author"},
        "labels": [{"name": label} for label in (labels or [])],
        "head": {"ref": "feature/example"},
        "base": {"ref": "main"},
    }
    key = "issue" if event_name == "issues" else "pull_request"
    return {"action": action, key: item, "label": {"name": added_label}}


class NotificationTests(unittest.TestCase):
    def test_workflow_uses_only_label_events_for_issues(self):
        workflow_path = Path(__file__).resolve().parents[1] / "workflows" / "discord-notifications.yml"
        workflow = workflow_path.read_text(encoding="utf-8")
        self.assertIn("  issues:\n    types: [labeled]\n", workflow)
        self.assertIn("  pull_request_target:\n    branches: [main]\n    types: [opened, labeled]\n", workflow)

    def test_each_configured_issue_role_is_explicitly_allowlisted(self):
        expected_roles = {
            "backend": "1563190105974513765",
            "frontend": "1563190563342258296",
            "CI/CD": "1563190406554984498",
            "infrastructure": "1563190449810833448",
            "IAM": "1563190604408553522",
        }
        self.assertEqual(LABEL_ROLES, expected_roles)
        for label, role in expected_roles.items():
            with self.subTest(label=label):
                event = event_payload(labels=[label])
                payload = embed_payload("issues", event, matching_labels("issues", event))
                self.assertEqual(payload["content"], f"<@&{role}>")
                self.assertEqual(payload["allowed_mentions"], {
                    "parse": [], "users": [], "roles": [role], "replied_user": False,
                })

    def test_opened_issue_groups_destinations_and_scopes_roles(self):
        event = event_payload(labels=["backend", "frontend", "IAM", "CI/CD", "infrastructure", "devops"])
        environ = {
            "DISCORD_BACKEND_WEBHOOK": "backend-url",
            "DISCORD_FRONTEND_WEBHOOK": "frontend-url",
            "DISCORD_DEVOPS_WEBHOOK": "devops-url",
        }
        routed = destinations(matching_labels("issues", event), environ)
        self.assertEqual(len(routed), 3)
        for webhook, labels in routed.items():
            with self.subTest(webhook=webhook):
                payload = embed_payload("issues", event, labels)
                expected = [LABEL_ROLES[label] for label in labels if label in LABEL_ROLES]
                self.assertEqual(payload["allowed_mentions"]["roles"], expected)
                self.assertEqual(payload["content"], " ".join(f"<@&{role}>" for role in expected))

    def test_labeled_issue_mentions_only_new_label(self):
        event = event_payload(action="labeled", labels=["backend", "IAM"], added_label="IAM")
        labels = matching_labels("issues", event)
        self.assertEqual(labels, ["IAM"])
        payload = embed_payload("issues", event, labels)
        self.assertEqual(payload["allowed_mentions"]["roles"], [LABEL_ROLES["IAM"]])
        self.assertEqual(payload["content"], f"<@&{LABEL_ROLES['IAM']}>")

    def test_role_ids_are_deduplicated_for_shared_destinations(self):
        event = event_payload(labels=["IAM", "CI/CD", "IAM"])
        with patch.dict(LABEL_ROLES, {"CI/CD": LABEL_ROLES["IAM"]}):
            routed = destinations(matching_labels("issues", event), {"DISCORD_DEVOPS_WEBHOOK": "shared-url"})
            self.assertEqual(len(routed), 1)
            payload = embed_payload("issues", event, routed["shared-url"])
        self.assertEqual(payload["allowed_mentions"]["roles"], [LABEL_ROLES["IAM"]])
        self.assertEqual(payload["content"], f"<@&{LABEL_ROLES['IAM']}>")

    def test_unmapped_role_still_delivers_without_mentions(self):
        for label in ("devops", "backend"):
            with self.subTest(label=label), patch.dict(LABEL_ROLES, {}, clear=True):
                event = event_payload(labels=[label])
                routed = destinations(matching_labels("issues", event), {
                    "DISCORD_BACKEND_WEBHOOK": "channel-url",
                    "DISCORD_DEVOPS_WEBHOOK": "channel-url",
                })
                self.assertEqual(len(routed), 1)
                payload = embed_payload("issues", event, routed["channel-url"])
                self.assertNotIn("content", payload)
                self.assertEqual(payload["allowed_mentions"]["roles"], [])
                self.assertEqual(len(payload["embeds"]), 1)

    def test_pr_notifications_remain_mention_free(self):
        for action in ("opened", "labeled"):
            with self.subTest(action=action):
                event = event_payload("pull_request_target", action, ["backend", "IAM"])
                labels = matching_labels("pull_request_target", event)
                payload = embed_payload("pull_request_target", event, labels)
                self.assertEqual(set(payload), {"allowed_mentions", "embeds"})
                self.assertEqual(payload["allowed_mentions"], {
                    "parse": [], "users": [], "roles": [], "replied_user": False,
                })
                self.assertEqual(payload["embeds"][0]["fields"], [
                    {"name": "Branches", "value": "`feature/example → main`"},
                ])

    def test_unrouted_labels_are_ignored(self):
        for action in ("opened", "labeled"):
            for label in ("documentation", "LLM"):
                with self.subTest(action=action, label=label):
                    event = event_payload(action=action, labels=[label], added_label=label)
                    self.assertEqual(matching_labels("issues", event), [])


if __name__ == "__main__":
    unittest.main()
