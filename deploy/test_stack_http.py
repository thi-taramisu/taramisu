"""Regression coverage for local failover probes without an IPv6 fallback delay."""

from http.cookiejar import CookieJar
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import threading
import unittest
from unittest.mock import patch
import urllib.request

import stack_test


class ProbeHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/redirect":
            self.send_response(302)
            self.send_header("Location", "/check")
            self.send_header("Set-Cookie", "probe=ok; Path=/")
            self.end_headers()
            return
        data = (self.headers["Host"] + " " + self.headers.get("Cookie", "")).encode()
        self.send_response(200)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class LocalhostTransportTest(unittest.TestCase):
    def test_preserves_origin_host_redirects_and_cookies(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), ProbeHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        host = f"localhost:{server.server_port}"
        jar = CookieJar()
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            stack_test.LocalhostHTTPHandler(),
            urllib.request.HTTPCookieProcessor(jar),
        )
        original = stack_test.http.client.HTTPConnection
        connections = []

        def connect(address, **kwargs):
            connections.append(address)
            return original(address, **kwargs)

        try:
            with patch.object(stack_test.http.client, "HTTPConnection", side_effect=connect):
                with opener.open(f"http://{host}/redirect", timeout=2) as response:
                    self.assertEqual(response.url, f"http://{host}/check")
                    self.assertEqual(response.read().decode(), f"{host} probe=ok")
            self.assertEqual(connections, [f"127.0.0.1:{server.server_port}"] * 2)
            self.assertTrue(list(jar)[0].domain.startswith("localhost"))
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_non_local_http_host_keeps_its_address(self):
        handler = stack_test.LocalhostHTTPHandler()
        request = urllib.request.Request("http://example.test:8080/check")
        with (
            patch.object(handler, "do_open", side_effect=lambda factory, req: factory(req.host, timeout=2)),
            patch.object(stack_test.http.client, "HTTPConnection") as connect,
        ):
            handler.http_open(request)
            connect.assert_called_once_with("example.test:8080", timeout=2)
