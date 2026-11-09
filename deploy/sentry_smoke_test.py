"""Exercise the real API SDK through the internal-only NGINX ingest route.

Run after starting the stack, or pass --api-image for a locally built API image.
The collector uses a temporary trusted TLS certificate; no event reaches Sentry.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent.parent
PYTHON_IMAGE = "python:3.13-alpine"
DSN = "https://public@o1.ingest.sentry.io/42"


def run(*args, check=True, timeout=180):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout, check=False)
    if check and result.returncode:
        raise RuntimeError(f"Command failed: {' '.join(args)}\n{result.stderr}")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-image")
    args = parser.parse_args()
    image = args.api_image
    if not image:
        model = json.loads(run("docker", "compose", "--env-file", str(ROOT / "iam/.env"), "-f", str(ROOT / "deploy/compose.yaml"), "config", "--format", "json").stdout)
        image = model["services"]["api"]["image"]
        run("docker", "image", "inspect", image)
    prefix = "sentry-smoke-" + uuid.uuid4().hex[:10]
    inside, outside = prefix + "-inside", prefix + "-outside"
    containers = []
    networks = []
    try:
        for name, internal in ((inside, True), (outside, False)):
            run("docker", "network", "create", *( ["--internal"] if internal else [] ), name)
            networks.append(name)
        with tempfile.TemporaryDirectory(prefix="taramisu-sentry-") as directory:
            fixture = Path(directory)
            (fixture / "cert.cnf").write_text("[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=o1.ingest.sentry.io\n[ext]\nsubjectAltName=DNS:o1.ingest.sentry.io\nbasicConstraints=critical,CA:TRUE\n")
            run("openssl", "req", "-x509", "-nodes", "-newkey", "rsa:2048", "-days", "1", "-config", str(fixture / "cert.cnf"), "-keyout", str(fixture / "key.pem"), "-out", str(fixture / "cert.pem"))
            (fixture / "collector.py").write_text('''import http.server,json,ssl
from pathlib import Path
class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get("Content-Length",0))).decode()
        with Path("/fixture/events.jsonl").open("a") as output:
            output.write(json.dumps({"path":self.path,"host":self.headers.get("Host"),"authorization":self.headers.get("Authorization"),"cookie":self.headers.get("Cookie"),"body":body})+"\\n")
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"{}")
server=http.server.ThreadingHTTPServer(("0.0.0.0",443),Handler)
context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
context.load_cert_chain("/fixture/cert.pem","/fixture/key.pem")
server.socket=context.wrap_socket(server.socket,server_side=True)
server.serve_forever()
''')
            collector, dummy, proxy, ingest = prefix + "-collector", prefix + "-dummy", prefix + "-proxy", prefix + "-ingest"
            run("docker", "run", "-d", "--name", collector, "--network", outside, "--network-alias", "o1.ingest.sentry.io", "-v", f"{fixture}:/fixture", PYTHON_IMAGE, "python", "/fixture/collector.py")
            containers.append(collector)
            collector_ip = json.loads(run("docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", collector).stdout)[outside]["IPAddress"]
            run("docker", "run", "-d", "--name", dummy, "--network", inside, "--network-alias", "frontend", "--network-alias", "docs", "--network-alias", "authentik-server", "--network-alias", "api", "nginx:1.28-alpine")
            containers.append(dummy)
            run("docker", "create", "--name", ingest, "--network", inside, "--network-alias", "sentry-ingest", "-e", f"SENTRY_DSN={DSN}", "-v", f"{ROOT / 'proxy/25-sentry-ingest.sh'}:/docker-entrypoint.d/25-sentry-ingest.sh:ro", "-v", f"{fixture / 'cert.pem'}:/etc/ssl/certs/ca-certificates.crt:ro", "nginx:1.28-alpine")
            containers.append(ingest)
            run("docker", "network", "connect", outside, ingest)
            run("docker", "start", ingest)
            published = json.loads(run("docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", ingest).stdout)
            assert not published, published
            run("docker", "create", "--name", proxy, "--network", inside, "--network-alias", "proxy", "-p", "127.0.0.1::80", "-v", f"{ROOT / 'proxy/nginx.conf'}:/etc/nginx/conf.d/default.conf:ro", "nginx:1.28-alpine")
            containers.append(proxy)
            run("docker", "network", "connect", outside, proxy)
            run("docker", "start", proxy)
            bindings = json.loads(run("docker", "inspect", "--format", "{{json .HostConfig.PortBindings}}", proxy).stdout)
            assert set(bindings) == {"80/tcp"}, bindings
            ports = json.loads(run("docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", proxy).stdout)
            port = ports["80/tcp"][0]["HostPort"]
            for _ in range(30):
                try:
                    with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.2)
            else:
                logs = run("docker", "logs", proxy)
                raise RuntimeError("NGINX did not become ready:\n" + logs.stdout + logs.stderr)
            probe = '''import socket,sys,urllib.request,urllib.error
for method,path,want in [("POST","/api/42/envelope/",200),("GET","/api/42/envelope/",405),("POST","/api/43/envelope/",404),("POST","/api/42/store/",404),("POST","/",404)]:
    request=urllib.request.Request("http://sentry-ingest:8081"+path,data=b"route-check" if method=="POST" else None,method=method,headers={"Authorization":"Bearer must-not-forward","Cookie":"session=must-not-forward"})
    try:
        response=urllib.request.urlopen(request,timeout=10)
        status=response.status
        response.close()
    except urllib.error.HTTPError as error:
        status=error.code
    assert status==want,(method,path,status,want)
try:
    connection=socket.create_connection((sys.argv[1],443),timeout=2)
except OSError:
    pass
else:
    connection.close()
    raise AssertionError("internal client unexpectedly reached the external collector directly")
'''
            run("docker", "run", "--rm", "--network", inside, PYTHON_IMAGE, "python", "-c", probe, collector_ip)
            events_path = fixture / "events.jsonl"
            records = [json.loads(line) for line in events_path.read_text().splitlines()]
            assert len(records) == 1, records
            assert records[0]["host"] == "o1.ingest.sentry.io"
            assert not records[0]["authorization"] and not records[0]["cookie"]
            # Missing DATABASE_URL deliberately causes a startup error in the actual API binary.
            # Its SDK must flush that report through the proxy despite having no external network.
            result = run("docker", "run", "--rm", "--network", inside, "-e", f"SENTRY_DSN={DSN}", "-e", "SENTRY_TUNNEL_URL=http://sentry-ingest:8081", "-e", "SENTRY_ENVIRONMENT=sentry-smoke", "-e", "DATABASE_URL=", image, check=False)
            assert result.returncode == 1, result.stderr
            records = [json.loads(line) for line in events_path.read_text().splitlines()]
            delivered = [row for row in records if "server stopped" in row["body"]]
            assert delivered, result.stderr
            assert all(row["path"] == "/api/42/envelope/" for row in records)
            assert DSN in delivered[0]["body"] and "sentry-smoke" in delivered[0]["body"]
            # The externally published listener must not expose the ingest route.
            before = len(records)
            try:
                urllib.request.urlopen(urllib.request.Request(f"http://127.0.0.1:{port}/api/42/envelope/", data=b"external-ingest"), timeout=5).close()
            except urllib.error.HTTPError:
                pass
            assert len(events_path.read_text().splitlines()) == before
            print("Sentry smoke test passed: SDK delivery, TLS verification, project/method restrictions, no direct API egress, and no public ingest route.")
    finally:
        for container in reversed(containers):
            run("docker", "rm", "-f", container, check=False)
        for network in reversed(networks):
            run("docker", "network", "rm", network, check=False)


if __name__ == "__main__":
    main()
