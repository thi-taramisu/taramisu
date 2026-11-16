"""Live flow regressions; run through ak shell (see README)."""

import base64
import hashlib
import json
import os
import unittest
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

from django.conf import settings
from requests import Session

from authentik.core.models import User

BASE = f"http://authentik-server:9000{os.environ.get('AUTHENTIK_WEB__PATH', '').rstrip('/')}"


class EnrollmentTest(unittest.TestCase):
    def setUp(self):
        self.prefix = f"enrollment-test-{uuid4().hex}"
        self.password = uuid4().hex
        self.addCleanup(
            lambda: User.objects.filter(username__istartswith=self.prefix).delete()
        )

    def begin(self, slug="taramisu-enrollment", client=None, query=""):
        client = client or Session()
        for _ in range(5):
            client.get(f"{BASE}/if/flow/{slug}/?{query}", timeout=20).raise_for_status()
            url = f"{BASE}/api/v3/flows/executor/{slug}/?" + urllib.parse.urlencode({"query": query})
            response = client.get(url, timeout=20)
            response.raise_for_status()
            challenge = response.json()
            if challenge["component"] != "xak-flow-redirect":
                return client, url
            target = urllib.parse.urlparse(challenge["to"])
            slug = target.path.rstrip("/").split("/")[-1]
            query = target.query
        self.fail("Language routing did not converge")

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

    def login(self, identifier, user=None, client=None):
        flow = self.begin("default-authentication-flow", client)
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

    def language_client(self, language):
        client = Session()
        # The app selection must override the browser's preference and a stale IAM cookie.
        client.headers["Accept-Language"] = "en" if language == "de" else "de"
        client.cookies.set(settings.LANGUAGE_COOKIE_NAME, "en" if language == "de" else "de")
        response = client.get(
            f"{BASE}/application/o/authorize/",
            params={
                "client_id": "taramisu", "response_type": "code",
                "redirect_uri": "http://localhost/auth/callback",
                "code_challenge": "A" * 43, "code_challenge_method": "S256",
                "ui_locales": language,
            }, allow_redirects=False, timeout=20,
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.cookies.get(settings.LANGUAGE_COOKIE_NAME), language)
        self.assertEqual(
            urllib.parse.parse_qs(urllib.parse.urlparse(response.headers["Location"]).query)["locale"],
            [language],
        )
        # Drop the deliberately stale hostless cookie; use the server's scoped cookie.
        client.cookies.clear(domain="", path="/", name=settings.LANGUAGE_COOKIE_NAME)
        return client

    def test_localized_login_registration_and_validation(self):
        for language in ("en", "de"):
            with self.subTest(language=language):
                german = language == "de"
                client = self.language_client(language)
                login = self.begin("default-authentication-flow", client)
                challenge = client.get(login[1], timeout=20).json()
                self.assertEqual(challenge["component"], "ak-stage-identification")
                self.assertEqual(challenge["flow_info"]["title"],
                                 "Bei Taramisu anmelden" if german else "Sign in to Taramisu")
                enrollment_slug = urllib.parse.urlparse(challenge["enroll_url"]).path.rstrip("/").split("/")[-1]
                flow = self.begin(enrollment_slug, client)
                challenge = client.get(flow[1], timeout=20).json()
                self.assertEqual(challenge["flow_info"]["title"],
                                 "Für Taramisu registrieren" if german else "Register for Taramisu")
                self.assertEqual([field["label"] for field in challenge["fields"]],
                                 ["Benutzername", "Name", "E-Mail-Adresse", "Passwort", "Passwort bestätigen"]
                                 if german else ["Username", "Name", "Email", "Password", "Confirm password"])
                username = self.prefix + "-" + language
                data = dict(component="ak-stage-prompt", username=" " + username + " ",
                            email=username + "@example.com", name="Language test",
                            password=self.password, password_repeat=self.password)
                for changes, expected in (
                    ({"password": "short", "password_repeat": "short"},
                     "Verwende mindestens 12 Zeichen" if german else "Use at least 12 characters"),
                    ({"username": "invalid@name"},
                     "Verwende Buchstaben" if german else "Use letters"),
                ):
                    result = self.post(flow, **(data | changes))
                    self.assertIn(expected, json.dumps(result, ensure_ascii=False))
                    self.assertFalse(User.objects.filter(username=username).exists())
                result = self.post(flow, **(data | {"password_repeat": "different"}))
                self.assertIn("Passwörter stimmen nicht überein" if german else "Passwords don't match.",
                              json.dumps(result, ensure_ascii=False))
                result = self.post(flow, **data)
                self.assertIn("Ein Administrator muss dein Konto freigeben" if german
                              else "An administrator must approve your account", json.dumps(result, ensure_ascii=False))
                user = User.objects.get(username=username)
                self.assertFalse(user.is_active)
                for candidate, email, expected in (
                    (username, username + "-other@example.com",
                     "Dieser Benutzername ist bereits vergeben." if german else "Username is already taken."),
                    (username + "-other", user.email.upper(),
                     "Diese E-Mail-Adresse wird bereits verwendet." if german else "Email address is already in use."),
                ):
                    result = self.enroll(candidate, email, self.begin(client=self.language_client(language)))
                    self.assertIn(expected, json.dumps(result, ensure_ascii=False))
                user.is_active = True
                user.save()
                self.seed("-collision-" + language, user.email)
                _, result = self.login(user.email, client=self.language_client(language))
                self.assertEqual(result["component"], "ak-stage-access-denied")
                self.assertIn("Diese Anmeldekennung ist nicht eindeutig" if german
                              else "This login identifier is ambiguous", json.dumps(result, ensure_ascii=False))

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

    def test_pkce_enforcement_and_verifier_validation(self):
        user = self.seed("-pkce", self.prefix + "-pkce@example.com")
        user.is_active = True
        user.save()
        client, _ = self.login(user.username, user)

        def make_pkce():
            verifier = base64.urlsafe_b64encode(os.urandom(32)).decode("utf-8").rstrip("=")
            challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("utf-8")).digest()).decode("utf-8").rstrip("=")
            return verifier, challenge

        # 1. Authorization request without code_challenge must be rejected by the policy.
        resp_no_pkce = client.get(
            f"{BASE}/application/o/authorize/",
            params={
                "client_id": "taramisu",
                "response_type": "code",
                "redirect_uri": "http://localhost/auth/callback",
            },
            allow_redirects=False,
        )
        location = resp_no_pkce.headers.get("Location", "")
        self.assertFalse(
            resp_no_pkce.status_code == 302 and location.startswith("http://localhost/auth/callback"),
            f"Expected authorization without PKCE challenge to be rejected, got redirect to {location}",
        )

        # 2. Authorization request with valid S256 challenge must succeed and issue an authorization code.
        verifier, challenge = make_pkce()
        resp_with_pkce = client.get(
            f"{BASE}/application/o/authorize/",
            params={
                "client_id": "taramisu",
                "response_type": "code",
                "redirect_uri": "http://localhost/auth/callback",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
            allow_redirects=False,
        )
        self.assertEqual(resp_with_pkce.status_code, 302)
        callback_loc = resp_with_pkce.headers.get("Location", "")
        self.assertTrue(callback_loc.startswith("http://localhost/auth/callback"))
        query = urllib.parse.parse_qs(urllib.parse.urlparse(callback_loc).query)
        self.assertIn("code", query)
        code = query["code"][0]

        # 3. Redeeming the challenged code with an incorrect code_verifier must fail with invalid_grant.
        bad_token_resp = client.post(
            f"{BASE}/application/o/token/",
            data={
                "grant_type": "authorization_code",
                "client_id": "taramisu",
                "code": code,
                "redirect_uri": "http://localhost/auth/callback",
                "code_verifier": "incorrect-verifier-" + uuid4().hex,
            },
        )
        self.assertEqual(bad_token_resp.status_code, 400)
        self.assertEqual(bad_token_resp.json().get("error"), "invalid_grant")

        # 4. Redeeming a fresh challenged code with the matching code_verifier must succeed.
        verifier2, challenge2 = make_pkce()
        resp2 = client.get(
            f"{BASE}/application/o/authorize/",
            params={
                "client_id": "taramisu",
                "response_type": "code",
                "redirect_uri": "http://localhost/auth/callback",
                "code_challenge": challenge2,
                "code_challenge_method": "S256",
            },
            allow_redirects=False,
        )
        self.assertEqual(resp2.status_code, 302)
        code2 = urllib.parse.parse_qs(urllib.parse.urlparse(resp2.headers["Location"]).query)["code"][0]
        good_token_resp = client.post(
            f"{BASE}/application/o/token/",
            data={
                "grant_type": "authorization_code",
                "client_id": "taramisu",
                "code": code2,
                "redirect_uri": "http://localhost/auth/callback",
                "code_verifier": verifier2,
            },
        )
        self.assertEqual(good_token_resp.status_code, 200)
        tokens = good_token_resp.json()
        self.assertIn("access_token", tokens)


        # 5. Unapproved localhost redirect URIs must be rejected by strict matching.
        _, challenge3 = make_pkce()
        resp_bad_redirect = client.get(
            f"{BASE}/application/o/authorize/",
            params={
                "client_id": "taramisu",
                "response_type": "code",
                "redirect_uri": "http://localhost:4444/eval/route",
                "code_challenge": challenge3,
                "code_challenge_method": "S256",
            },
            allow_redirects=False,
        )
        bad_redirect_loc = resp_bad_redirect.headers.get("Location", "")
        self.assertFalse(
            resp_bad_redirect.status_code == 302 and bad_redirect_loc.startswith("http://localhost:4444/"),
            f"Expected unapproved localhost redirect_uri to be rejected, got redirect to {bad_redirect_loc}",
        )


suite = unittest.defaultTestLoader.loadTestsFromTestCase(EnrollmentTest)
if not unittest.TextTestRunner(verbosity=2).run(suite).wasSuccessful():
    raise SystemExit(1)
