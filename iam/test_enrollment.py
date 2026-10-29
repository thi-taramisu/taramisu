"""Live flow regressions; run through ak shell (see README)."""

import unittest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from requests import Session

from authentik.core.models import User

BASE = "http://authentik-server:9000"


class EnrollmentTest(unittest.TestCase):
    def setUp(self):
        self.prefix = f"enrollment-test-{uuid4().hex}"
        self.password = uuid4().hex
        self.addCleanup(
            lambda: User.objects.filter(username__istartswith=self.prefix).delete()
        )

    def begin(self, slug="taramisu-enrollment", client=None):
        client = client or Session()
        client.get(f"{BASE}/if/flow/{slug}/", timeout=20).raise_for_status()
        url = f"{BASE}/api/v3/flows/executor/{slug}/"
        client.get(url, timeout=20).raise_for_status()
        return client, url

    def post(self, flow, **data):
        client, url = flow
        response = client.post(url, json=data, timeout=20, headers={
            "X-authentik-csrf": client.cookies.get("authentik_csrf"),
            "Referer": BASE + "/",
        })
        response.raise_for_status()
        return response.json()

    def enroll(self, username, email=None, flow=None):
        return self.post(
            flow or self.begin(), component="ak-stage-prompt", username=username,
            email=email or f"{username}@example.com", name="Regression test",
            password=self.password, password_repeat=self.password,
        )

    def login(self, identifier, user=None):
        flow = self.begin("default-authentication-flow")
        result = self.post(flow, component="ak-stage-identification", uid_field=identifier)
        if result["component"] == "ak-stage-password":
            result = self.post(flow, component="ak-stage-password", password=self.password)
        response = flow[0].get(f"{BASE}/api/v3/core/users/me/", timeout=20)
        self.assertEqual(response.status_code, 200 if user else 403, result)
        if user:
            self.assertEqual(response.json()["user"]["pk"], user.pk)
        return flow[0], result

    def seed(self, suffix, email):
        return User.objects.create_user(
            username=self.prefix + suffix, email=email, password=self.password,
        )

    def test_approval_and_identifier_validation(self):
        username = self.prefix + "-Mixed"
        self.enroll(username)
        user = User.objects.get(username=username.lower())
        self.assertFalse(user.is_active)
        self.login(username)
        for active in (False, True):
            user.is_active = active
            user.save()
            for candidate, email in (
                (username.upper(), self.prefix + "-other@example.com"),
                (self.prefix + "-other", user.email.upper()),
                (self.prefix + "@example.com", self.prefix + "-other@example.com"),
            ):
                with self.subTest(active=active, username=candidate, email=email):
                    self.assertIn("response_errors", self.enroll(candidate, email))
            self.assertEqual(User.objects.filter(username__startswith=self.prefix).count(), 1)
        for identifier in (username.upper(), user.email.upper()):
            self.login(identifier, user)

    def test_legacy_collisions_are_denied(self):
        cases = (
            ("email", "-email-other"),
            ("cross-field", "-cross-field@example.com"),
            ("case", "-CASE"),
        )
        for kind, second_suffix in cases:
            with self.subTest(kind=kind):
                email = f"{self.prefix}-{kind}@example.com"
                first = self.seed(f"-{kind}", email)
                self.seed(second_suffix, email if kind == "email" else "other@example.com")
                identifier = first.username if kind == "case" else email
                _, result = self.login(identifier)
                self.assertEqual(result["component"], "ak-stage-access-denied")
                if kind != "case":
                    self.login(first.username, first)

    def test_concurrent_registration(self):
        for shared_email in (False, True):
            with self.subTest(shared_email=shared_email):
                username = f"{self.prefix}-race-{shared_email}".lower()
                names = [username, username + "-other" if shared_email else username.upper()]
                flows = [self.begin(), self.begin()]
                barrier = Barrier(2)

                def register(i):
                    barrier.wait(timeout=10)
                    return self.enroll(names[i], username + "@example.com", flows[i])

                with ThreadPoolExecutor(max_workers=2) as pool:
                    results = list(pool.map(register, (0, 1)))
                users = list(User.objects.filter(username__istartswith=username))
                self.assertIn(len(users), (1, 2) if shared_email else (1,), results)
                for user in users:
                    self.assertFalse(user.is_active)
                    user.is_active = True
                    user.save()
                    self.login(user.username.upper(), user)
                _, result = self.login(username + "@example.com", users[0] if len(users) == 1 else None)
                if len(users) == 2:
                    self.assertEqual(result["component"], "ak-stage-access-denied")

    def test_profile_validation(self):
        first = self.seed("-a", self.prefix + "-a@example.com")
        second = self.seed("-b", self.prefix + "-b@example.com")
        client, _ = self.login(first.username, first)
        flow = self.begin("default-user-settings-flow", client)
        data = {
            "component": "ak-stage-prompt", "username": first.username,
            "name": "Updated name", "email": first.email,
            "attributes.settings.locale": "en",
        }
        for changes in ({"email": second.email.upper()}, {"username": first.username + "@example.com"}):
            with self.subTest(changes=changes):
                self.assertIn("response_errors", self.post(flow, **(data | changes)))
        first.refresh_from_db()
        self.assertEqual((first.username, first.email), (data["username"], data["email"]))
        self.assertNotIn("response_errors", self.post(flow, **data))
        first.refresh_from_db()
        self.assertEqual(first.name, "Updated name")


suite = unittest.defaultTestLoader.loadTestsFromTestCase(EnrollmentTest)
if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
    raise SystemExit(1)
