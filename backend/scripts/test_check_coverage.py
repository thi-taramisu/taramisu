"""Regression tests for the CI coverage gate."""

import unittest

from check_coverage import MODULE, coverage_table


def block(path, statements, count):
    return f"{MODULE}{path}:1.1,2.1 {statements} {count}\n"


class CoverageTests(unittest.TestCase):
    def test_exact_threshold_and_excluded_packages(self):
        profile = "mode: atomic\n"
        profile += block("internal/httpapi/router.go", 8, 2)
        profile += block("internal/httpapi/other.go", 2, 0)
        for path in ("cmd/api/main.go", "internal/db/models.go", "internal/db/health.sql.go",
                     "internal/db/db.go", "internal/httpapi_extra/example.go"):
            profile += block(path, 100, 0)
        report, passed = coverage_table(profile)
        self.assertTrue(passed)
        self.assertIn("80.00%", report)
        self.assertIn("| 8 | 10 |", report)

    def test_each_package_must_pass_including_future_services(self):
        profile = "mode: atomic\n" + block("internal/httpapi/router.go", 1000, 1)
        profile += block("internal/service/projects/service.go", 1, 0)
        report, passed = coverage_table(profile)
        self.assertFalse(passed)
        self.assertIn("internal/service/projects", report)
        self.assertIn("Failed", report)

    def test_does_not_round_up_to_threshold(self):
        profile = "mode: atomic\n" + block("internal/httpapi/router.go", 79999, 1)
        profile += block("internal/httpapi/other.go", 20001, 0)
        self.assertFalse(coverage_table(profile)[1])

    def test_empty_missing_domain_and_malformed_profiles_fail(self):
        for profile in ("", "mode: atomic\n", "invalid\n", "mode: atomic\nbad",
                        "mode: atomic\n" + block("cmd/api/main.go", 100, 1)):
            with self.subTest(profile=profile), self.assertRaises(ValueError):
                coverage_table(profile)


if __name__ == "__main__":
    unittest.main()
