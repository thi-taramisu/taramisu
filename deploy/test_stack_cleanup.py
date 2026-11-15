"""Offline regression tests for restoring the stack after failover tests."""

import contextlib
import io
import unittest
from unittest.mock import patch

import stack_test


class CleanupTest(unittest.TestCase):
    def test_refreshes_proxy_after_restoring_ready_replicas(self):
        events = []
        with (
            patch.object(stack_test, "scale_api", side_effect=lambda *a, **k: events.append("scale")),
            patch.object(stack_test, "wait_for_api_replicas", return_value=[{"ip": "172.19.0.5"}]),
            patch.object(stack_test, "wait_for_replica_ready", side_effect=lambda ip: events.append("ready")),
            patch.object(stack_test, "run_compose", side_effect=lambda *a, **k: events.append(a[-1])),
            patch.object(stack_test, "proxy_ready", side_effect=lambda *a, **k: events == ["scale", "ready", "-t", "reload"]),
        ):
            self.assertTrue(stack_test.cleanup_stack(1))

    def test_failed_reload_does_not_report_success(self):
        with (
            patch.object(stack_test, "scale_api"),
            patch.object(stack_test, "wait_for_api_replicas", return_value=[{"ip": "172.19.0.5"}]),
            patch.object(stack_test, "wait_for_replica_ready"),
            patch.object(stack_test, "run_compose", side_effect=[None, RuntimeError("reload failed")]),
            patch.object(stack_test, "proxy_ready") as readiness,
            contextlib.redirect_stderr(io.StringIO()),
        ):
            self.assertFalse(stack_test.cleanup_stack(1))
            readiness.assert_not_called()
