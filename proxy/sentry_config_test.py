"""Validate the restricted NGINX ingest configuration without Docker or network access."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("25-sentry-ingest.sh")


class SentryConfigTest(unittest.TestCase):
    def render(self, dsn):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "sentry.conf"
            output.write_text("previous valid configuration")
            result = subprocess.run(["sh", str(SCRIPT)], env={**os.environ, "SENTRY_DSN": dsn, "SENTRY_PROXY_CONFIG_PATH": str(output)}, capture_output=True, text=True, check=False)
            return result, output.read_text()

    def test_disabled(self):
        result, config = self.render("")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("listen 8081", config)
        self.assertNotIn("proxy_pass", config)

    def test_cloud_regions_and_project(self):
        for host in ("o1.ingest.sentry.io", "o123.ingest.de.sentry.io", "o123.ingest.us.sentry.io"):
            with self.subTest(host=host):
                result, config = self.render(f"https://public@{host}/42")
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("location = /api/42/envelope/", config)
                self.assertIn(f"set $sentry_ingest_host {host};", config)
                self.assertIn("$request_method != POST", config)
                self.assertIn("proxy_ssl_verify on", config)
                self.assertIn("proxy_ssl_server_name on", config)
                self.assertIn('proxy_set_header Authorization "";', config)
                self.assertIn("location / { return 404; }", config)
                self.assertNotIn("public", config)

    def test_invalid_targets_preserve_previous_config(self):
        for dsn in ("https://public@example.com/42", "https://public@o1.ingest.sentry.io.evil.test/42", "http://public@o1.ingest.sentry.io/42", "https://public@o1.ingest.sentry.io:444/42", "https://public@o1.ingest.sentry.io/42/extra", "https://public@o1.ingest.sentry.io/42?target=evil", "https://public@o1.ingest.sentry.io/42\nserver {}"):
            with self.subTest(dsn=dsn):
                result, config = self.render(dsn)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(config, "previous valid configuration")
                self.assertNotIn(dsn, result.stderr)


if __name__ == "__main__":
    unittest.main()
