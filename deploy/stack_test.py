"""Live multi-replica and failover verification against the running Compose stack.

Validates:
1. OIDC Authorization Code + PKCE flow against Authentik via NGINX.
2. Bearer JWT claims (alg, iss, aud, sub, name, email, validity).
3. Direct acceptance of the exact same JWT by each scaled replica (via container IP).
4. Direct and proxied rejection of missing or tampered tokens (401).
5. Load distribution across both replicas.
6. No failed requests while a replica is stopped (SIGTERM) or killed (SIGKILL) under load,
   with the proxy_next_upstream retry recorded in the NGINX access log.
7. Removal of the dead replica from the upstream pool by the NGINX runtime resolver.
8. Cold-cache token acceptance and NGINX re-integration of a restarted replica.

Timing assumptions (resolver valid=, fail_timeout=) are read from proxy/nginx.conf.
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import hashlib
from http.cookiejar import CookieJar
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import threading
import time
from typing import Any
import unittest
import urllib.error
import urllib.parse
import urllib.request
import uuid

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ENV_FILE = REPO_ROOT / "iam" / ".env"
COMPOSE_FILE = SCRIPT_DIR / "compose.yaml"
PROXY_CONF = REPO_ROOT / "proxy" / "nginx.conf"

# Unique identifier for this test run so proxy access logs can be correlated
# strictly to test requests, preventing cross-contamination from other clients.
RUN_ID = uuid.uuid4().hex[:8]
# Only read proxy logs written during this run; the margin absorbs host/Docker VM clock skew.
LOG_SINCE = (datetime.now(timezone.utc) - timedelta(minutes=1)).strftime("%Y-%m-%dT%H:%M:%SZ")


class ComposeError(RuntimeError):
    """Raised when a docker compose command exits with non-zero status."""


def read_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.is_file():
        return env
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, val = line.split("=", 1)
            env[key.strip()] = val.strip().strip("'\"")
    return env


def read_proxy_timings(path: Path = PROXY_CONF) -> tuple[float, float]:
    """Returns (fail_timeout, resolver_valid) in seconds as configured for the api upstream."""
    text = path.read_text(encoding="utf-8")
    fail_timeout = re.search(r"^\s*server\s+api:8080\b[^;]*\bfail_timeout=(\d+)s\b", text, re.MULTILINE)
    resolver_valid = re.search(r"^\s*resolver\s[^;]*\bvalid=(\d+)s\b", text, re.MULTILINE)
    if not fail_timeout or not resolver_valid:
        raise RuntimeError(
            f"{path} must set 'fail_timeout=<n>s' on the api upstream server and 'valid=<n>s' on the resolver"
        )
    return float(fail_timeout.group(1)), float(resolver_valid.group(1))


def run_compose(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    cmd = [
        "docker",
        "compose",
        "--env-file",
        str(ENV_FILE),
        "-f",
        str(COMPOSE_FILE),
        *args,
    ]
    proc = subprocess.run(
        cmd,
        cwd=str(SCRIPT_DIR),
        capture_output=True,
        text=True,
        check=False,
    )
    if check and proc.returncode != 0:
        raise ComposeError(
            f"Command failed (exit code {proc.returncode}): {' '.join(cmd)}\n"
            f"STDOUT:\n{proc.stdout}\n"
            f"STDERR:\n{proc.stderr}"
        )
    return proc


def scale_api(count: int) -> None:
    """Scales the api service without touching its dependencies or recreating running replicas."""
    run_compose("up", "-d", "--wait", "--no-deps", "--no-recreate", f"--scale=api={count}", "api")


def b64url_decode(s: str) -> bytes:
    rem = len(s) % 4
    if rem:
        s += "=" * (4 - rem)
    return base64.urlsafe_b64decode(s.encode("ascii"))


def decode_jwt(token: str) -> tuple[dict[str, Any], dict[str, Any]]:
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError(f"Expected 3 parts in JWT, got {len(parts)}")
    header = json.loads(b64url_decode(parts[0]).decode("utf-8"))
    payload = json.loads(b64url_decode(parts[1]).decode("utf-8"))
    return header, payload


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Prevents automatic redirection so 302 location headers can be inspected."""

    def http_error_302(self, req, fp, code, msg, headers):
        return fp

    http_error_301 = http_error_302
    http_error_303 = http_error_302
    http_error_307 = http_error_302
    http_error_308 = http_error_302


def get_cookie(jar: CookieJar, name: str) -> str:
    for cookie in jar:
        if cookie.name == name:
            return cookie.value
    return ""


def oidc_pkce_login(
    base_url: str,
    client_id: str,
    username: str,
    password: str,
    redirect_uri: str,
) -> str:
    """Performs an OIDC Authorization Code + PKCE login flow against Authentik via NGINX."""
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    base = base_url.rstrip("/")

    # 1. Initialize flow to establish session
    flow_init_url = f"{base}/auth/if/flow/default-authentication-flow/"
    with opener.open(urllib.request.Request(flow_init_url), timeout=20) as resp:
        resp.read()

    executor_url = f"{base}/auth/api/v3/flows/executor/default-authentication-flow/"
    with opener.open(urllib.request.Request(executor_url), timeout=20) as resp:
        resp.read()

    # 2. Stage: Identification
    csrf = get_cookie(jar, "authentik_csrf")
    headers = {
        "Content-Type": "application/json",
        "Referer": f"{base}/auth/",
    }
    if csrf:
        headers["X-authentik-csrf"] = csrf
    ident_body = json.dumps({"component": "ak-stage-identification", "uid_field": username}).encode("utf-8")
    req_ident = urllib.request.Request(executor_url, data=ident_body, headers=headers, method="POST")
    with opener.open(req_ident, timeout=20) as resp:
        ident_res = json.loads(resp.read().decode("utf-8"))

    if ident_res.get("component") != "ak-stage-password":
        raise RuntimeError(f"Expected ak-stage-password, got: {ident_res}")

    # 3. Stage: Password
    csrf = get_cookie(jar, "authentik_csrf")
    if csrf:
        headers["X-authentik-csrf"] = csrf
    pw_body = json.dumps({"component": "ak-stage-password", "password": password}).encode("utf-8")
    req_pw = urllib.request.Request(executor_url, data=pw_body, headers=headers, method="POST")
    with opener.open(req_pw, timeout=20) as resp:
        resp.read()

    # Verify session authentication
    with opener.open(urllib.request.Request(f"{base}/auth/api/v3/core/users/me/"), timeout=20) as resp:
        if resp.status != 200:
            raise RuntimeError(f"Authentik user verification failed with status {resp.status}")

    # 4. PKCE authorization code request
    verifier_bytes = os.urandom(32)
    verifier = base64.urlsafe_b64encode(verifier_bytes).decode("ascii").rstrip("=")
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest()).decode("ascii").rstrip("=")
    state = base64.urlsafe_b64encode(os.urandom(16)).decode("ascii").rstrip("=")

    auth_params = urllib.parse.urlencode({
        "client_id": client_id,
        "response_type": "code",
        "redirect_uri": redirect_uri,
        "scope": "openid profile email",
        "code_challenge": challenge,
        "code_challenge_method": "S256",
        "state": state,
    })
    auth_url = f"{base}/auth/application/o/authorize/?{auth_params}"

    no_redir_opener = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar),
        NoRedirect(),
    )
    auth_resp = no_redir_opener.open(urllib.request.Request(auth_url), timeout=20)
    loc = auth_resp.headers.get("Location")
    if not loc:
        raise RuntimeError(f"Expected redirect Location header from authorize endpoint, got status {auth_resp.status}")

    parsed = urllib.parse.urlparse(loc)
    qs = urllib.parse.parse_qs(parsed.query)
    if "code" not in qs:
        raise RuntimeError(f"Authorization code not present in redirect location: {loc}")
    code = qs["code"][0]
    ret_state = qs.get("state", [""])[0]
    if ret_state != state:
        raise RuntimeError(f"State mismatch in authorize redirect: expected {state}, got {ret_state}")

    # 5. Token exchange (public client, no client_secret)
    token_url = f"{base}/auth/application/o/token/"
    token_data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": client_id,
        "code": code,
        "redirect_uri": redirect_uri,
        "code_verifier": verifier,
    }).encode("utf-8")
    req_token = urllib.request.Request(
        token_url,
        data=token_data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req_token, timeout=20) as resp:
        token_res = json.loads(resp.read().decode("utf-8"))

    if "access_token" not in token_res:
        raise RuntimeError(f"No access_token found in token response: {token_res}")
    return token_res["access_token"]


def get_shared_network() -> str:
    """Finds the network name shared between proxy and api containers."""
    res_proxy = run_compose("ps", "-q", "proxy", check=False)
    proxy_cids = [cid.strip() for cid in res_proxy.stdout.splitlines() if cid.strip()]
    res_api = run_compose("ps", "-q", "api", check=False)
    api_cids = [cid.strip() for cid in res_api.stdout.splitlines() if cid.strip()]

    if proxy_cids and api_cids:
        p_inspect = subprocess.run(["docker", "inspect", proxy_cids[0]], capture_output=True, text=True, check=False)
        a_inspect = subprocess.run(["docker", "inspect", api_cids[0]], capture_output=True, text=True, check=False)
        if p_inspect.returncode == 0 and a_inspect.returncode == 0:
            p_nets = set(json.loads(p_inspect.stdout)[0].get("NetworkSettings", {}).get("Networks", {}).keys())
            a_nets = set(json.loads(a_inspect.stdout)[0].get("NetworkSettings", {}).get("Networks", {}).keys())
            common = p_nets & a_nets
            if common:
                return next(iter(common))

    project = os.environ.get("COMPOSE_PROJECT_NAME", "taramisu")
    return f"{project}_default"


def get_api_replicas() -> list[dict[str, str]]:
    """Returns running api container metadata (id, name, ip, network)."""
    res = run_compose("ps", "-q", "api")
    cids = [cid.strip() for cid in res.stdout.splitlines() if cid.strip()]
    replicas: list[dict[str, str]] = []
    shared_net = get_shared_network()

    for cid in cids:
        inspect_proc = subprocess.run(
            ["docker", "inspect", cid],
            capture_output=True,
            text=True,
            check=True,
        )
        info = json.loads(inspect_proc.stdout)[0]
        name = info.get("Name", "").lstrip("/")
        networks = info.get("NetworkSettings", {}).get("Networks", {})

        selected_ip = ""
        selected_net = ""
        if shared_net in networks and networks[shared_net].get("IPAddress"):
            selected_net = shared_net
            selected_ip = networks[shared_net]["IPAddress"]
        else:
            for net_name, net_cfg in networks.items():
                ip = net_cfg.get("IPAddress", "")
                if ip:
                    selected_ip = ip
                    selected_net = net_name
                    break

        if selected_ip and selected_net:
            replicas.append({
                "id": cid,
                "name": name,
                "ip": selected_ip,
                "network": selected_net,
            })
    return replicas


def wait_for_api_replicas(expected_count: int, timeout: float = 30.0) -> list[dict[str, str]]:
    """Polls until the expected count of api replicas are running and have IP addresses."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        replicas = get_api_replicas()
        if len(replicas) == expected_count and all(r["ip"] for r in replicas):
            return replicas
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for {expected_count} api replicas; current: {get_api_replicas()}")


def query_replica_direct(
    network: str,
    ip: str,
    token: str | None = None,
    path: str = "/api/v1/me",
) -> tuple[int, dict | str]:
    """Queries an api replica directly via its container IP using a temporary container on the network.

    The bearer token (if present) is passed via the subprocess environment and forwarded
    into docker using '-e AUTH_TOKEN' without exposing the raw secret value in the process table argv.
    """
    cmd = [
        "docker",
        "run",
        "--rm",
        "--network",
        network,
    ]
    env_vars = os.environ.copy()
    if token:
        cmd.extend(["-e", "AUTH_TOKEN"])
        env_vars["AUTH_TOKEN"] = f"Bearer {token}"
        wget_cmd = f'wget -S -O - --header "Authorization: $AUTH_TOKEN" http://{ip}:8080{path} 2>&1'
    else:
        wget_cmd = f'wget -S -O - http://{ip}:8080{path} 2>&1'

    cmd.extend([
        "nginx:1.28-alpine",
        "sh",
        "-c",
        wget_cmd,
    ])
    proc = subprocess.run(cmd, env=env_vars, capture_output=True, text=True, check=False)
    output = proc.stdout + proc.stderr
    status_match = re.search(r"HTTP/\d\.\d\s+(\d{3})", output)
    status_code = int(status_match.group(1)) if status_match else 0
    start = output.find("{")
    end = output.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return status_code, json.loads(output[start : end + 1])
        except Exception:
            pass
    return status_code, output.strip()


def wait_for_replica_ready(network: str, ip: str, timeout: float = 15.0) -> None:
    """Polls a replica's /health/ready endpoint directly until ready."""
    deadline = time.time() + timeout
    last_code = 0
    last_body: dict | str = ""
    while time.time() < deadline:
        last_code, last_body = query_replica_direct(network, ip, None, path="/health/ready")
        if last_code == 200:
            return
        time.sleep(0.5)
    raise TimeoutError(
        f"Replica at {ip} failed readiness check after {timeout}s: "
        f"last_status={last_code}, output={last_body}"
    )


def query_proxy(
    base_url: str,
    token: str | None = None,
    path: str = "/api/v1/me",
    phase: str = "default",
) -> tuple[int, dict | str]:
    """Queries the backend endpoint through the NGINX reverse proxy.

    Tags every request with a distinct User-Agent containing RUN_ID and phase
    to correlate access logs deterministically.
    """
    url = f"{base_url.rstrip('/')}{path}"
    req = urllib.request.Request(url)
    req.add_header("User-Agent", f"stack-test/{RUN_ID}/{phase}")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = resp.read().decode("utf-8")
            try:
                return resp.status, json.loads(data)
            except Exception:
                return resp.status, data
    except urllib.error.HTTPError as e:
        data = e.read().decode("utf-8", errors="replace")
        try:
            return e.code, json.loads(data)
        except Exception:
            return e.code, data
    except Exception as e:
        return 0, str(e)


class LoadGenerator(threading.Thread):
    """Sends tagged proxied requests back to back until stopped and records every response."""

    def __init__(self, base_url: str, token: str, phase: str) -> None:
        super().__init__(daemon=True)
        self.base_url = base_url
        self.token = token
        self.phase = phase
        self.results: list[tuple[int, dict | str]] = []
        self._halt = threading.Event()

    def run(self) -> None:
        while not self._halt.is_set():
            self.results.append(query_proxy(self.base_url, self.token, phase=self.phase))

    def stop(self) -> None:
        self._halt.set()
        self.join(timeout=10)


def upstream_ips(entry: dict[str, str]) -> list[str]:
    """Returns the upstream IPs NGINX tried for a request, in attempt order."""
    return [part.strip().split(":")[0] for part in entry["upstream_addr"].split(",")]


def get_proxy_upstream_entries(phase: str | None = None) -> list[dict[str, str]]:
    """Extracts upstream request entries from proxy access logs matching this test runner's RUN_ID.

    If phase is specified, returns only entries strictly tagged for that phase.
    """
    res = run_compose("logs", f"--since={LOG_SINCE}", "--no-color", "proxy", check=False)
    lines = res.stdout.splitlines()
    entries: list[dict[str, str]] = []
    # Log format: $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
    #             "$http_referer" "$http_user_agent" "$http_x_forwarded_for"
    #             upstream: $upstream_addr status: $upstream_status response_time: $upstream_response_time
    pattern = re.compile(
        r'"(?P<method>[A-Z]+)\s+(?P<uri>\S+)[^"]*"\s+(?P<http_status>\d+)\s+\d+\s+'
        r'"[^"]*"\s+"(?P<user_agent>[^"]*)"\s+"[^"]*"\s+'
        r'upstream:\s+(?P<upstream_addr>.+?)\s+status:\s+(?P<upstream_status>.+?)\s+response_time:\s+(?P<upstream_response_time>[^\r\n]+)'
    )
    parsed_any = False
    target_prefix = f"stack-test/{RUN_ID}/"
    expected_ua = f"stack-test/{RUN_ID}/{phase}" if phase else None

    for line in lines:
        m = pattern.search(line)
        if m:
            parsed_any = True
            d = m.groupdict()
            ua = d.get("user_agent", "")
            if expected_ua:
                if ua == expected_ua:
                    entries.append(d)
            elif ua.startswith(target_prefix):
                entries.append(d)

    if not parsed_any and any("upstream:" in l for l in lines):
        raise RuntimeError(
            "Proxy access log entries contain 'upstream:' markers but could not be parsed by the test regex. "
            "Verify that proxy/nginx.conf defines 'log_format upstream_logging' including $http_x_forwarded_for "
            "and that the NGINX proxy container has reloaded its configuration."
        )
    return entries


def wait_for_nginx_to_resolve_both_replicas(
    base_url: str,
    token: str,
    replica_ips: set[str],
    phase: str = "resolve_check",
    timeout: float = 25.0,
) -> None:
    """Sends requests tagged with phase until NGINX runtime resolver distributes to all replica IPs."""
    deadline = time.time() + timeout
    seen_ips: set[str] = set()
    while time.time() < deadline:
        query_proxy(base_url, token, phase=phase)
        for entry in get_proxy_upstream_entries(phase=phase):
            seen_ips.update(ip for ip in upstream_ips(entry) if ip in replica_ips)
        if seen_ips == replica_ips:
            return
        time.sleep(0.5)
    raise TimeoutError(
        f"NGINX failed to distribute traffic across all replicas {replica_ips} within {timeout}s; "
        f"only reached {seen_ips}"
    )


def cleanup_stack(initial_count: int) -> bool:
    """Restores the api service to its initial replica count. Returns True on success."""
    try:
        scale_api(initial_count)
        return True
    except Exception as e:
        print(f"Warning: stack cleanup failed: {e}", file=sys.stderr)
        return False


class MultiReplicaFailoverTest(unittest.TestCase):
    env: dict[str, str] = {}
    base_url: str = "http://localhost"
    client_id: str = "taramisu"
    redirect_uri: str = "http://localhost/auth/callback"
    token: str = ""
    header: dict[str, Any] = {}
    payload: dict[str, Any] = {}
    initial_user_id: str = ""
    initial_replica_count: int = 1
    # Set once the runner starts changing the stack; main() only restores it when this is True.
    scaled: bool = False
    replicas: list[dict[str, str]] = []

    @classmethod
    def setUpClass(cls) -> None:
        if not ENV_FILE.is_file():
            raise RuntimeError(f"Missing environment file: {ENV_FILE}. Run deploy/dev.sh first.")

        cls.env = read_env(ENV_FILE)
        dev_password = cls.env.get("DEV_PASSWORD")
        if not dev_password:
            raise RuntimeError(
                f"DEV_PASSWORD not set in {ENV_FILE}. Run deploy/dev.sh first to provision Authentik."
            )

        # Configuration resolution: Shell environment takes precedence, followed by iam/.env,
        # matching Docker Compose variable interpolation semantics.
        cls.base_url = (os.environ.get("APP_URL") or cls.env.get("APP_URL") or "http://localhost").rstrip("/")
        cls.client_id = os.environ.get("OIDC_CLIENT_ID") or cls.env.get("OIDC_CLIENT_ID") or "taramisu"
        cls.redirect_uri = f"{cls.base_url}/auth/callback"

        # Check stack readiness before scaling
        ready_url = f"{cls.base_url}/health/ready"
        ready = False
        for _ in range(15):
            try:
                with urllib.request.urlopen(ready_url, timeout=3) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(2)

        if not ready:
            raise RuntimeError(f"Stack is not ready at {ready_url}. Start it with deploy/dev.sh first.")

        # Obtain OIDC PKCE JWT token
        cls.token = oidc_pkce_login(
            cls.base_url,
            cls.client_id,
            "dev",
            dev_password,
            cls.redirect_uri,
        )
        cls.header, cls.payload = decode_jwt(cls.token)

        # Resolve initial user ID immediately via proxy
        status, body = query_proxy(cls.base_url, cls.token, phase="setup")
        if status != 200 or not isinstance(body, dict) or not body.get("id"):
            raise RuntimeError(f"Failed to resolve initial iam_user via /api/v1/me: status={status}, body={body}")
        cls.initial_user_id = str(body["id"])

        cls.initial_replica_count = len(get_api_replicas()) or 1
        cls.scaled = True

    def setUp(self) -> None:
        # Every test starts from two ready replicas that NGINX balances across, regardless of
        # what earlier tests stopped or killed.
        replicas = get_api_replicas()
        if len(replicas) != 2:
            scale_api(2)
            replicas = wait_for_api_replicas(2)
        for r in replicas:
            wait_for_replica_ready(r["network"], r["ip"])
        wait_for_nginx_to_resolve_both_replicas(
            self.base_url,
            self.token,
            {r["ip"] for r in replicas},
            phase=f"setup_{self._testMethodName}",
        )
        self.replicas = replicas

    def assert_me(self, status: int, body: dict | str, context: str) -> None:
        self.assertEqual(status, 200, f"{context} failed with status {status}: {body}")
        self.assertIsInstance(body, dict, f"{context} returned a non-JSON body: {body}")
        self.assertEqual(body.get("id"), self.initial_user_id, f"{context} resolved a different iam_user")

    def assert_failover(self, docker_command: str, phase: str) -> None:
        """Takes one replica down with docker_command under continuous load and verifies the failover."""
        fail_timeout, resolver_valid = read_proxy_timings()
        victim, survivor = self.replicas

        load = LoadGenerator(self.base_url, self.token, phase)
        load.start()
        try:
            time.sleep(0.5)
            proc = subprocess.run(["docker", docker_command, victim["id"]], capture_output=True, text=True, check=False)
            self.assertEqual(proc.returncode, 0, f"docker {docker_command} {victim['name']} failed: {proc.stderr}")
            stopped_at = time.monotonic()
            # Keep the load running past the resolver TTL so the replica is hit both before and after
            # Docker DNS drops its address.
            time.sleep(resolver_valid + 1)
        finally:
            load.stop()
        load_stopped_at = time.monotonic()

        # 1. Every request issued during the outage succeeded.
        self.assertTrue(load.results, "Load generator sent no requests")
        failed = [(s, b) for s, b in load.results if s != 200 or not isinstance(b, dict) or b.get("id") != self.initial_user_id]
        self.assertEqual(failed, [], f"{len(failed)} of {len(load.results)} requests failed during failover")

        # 2. NGINX retried the dead replica on the survivor (proxy_next_upstream).
        retries = [e for e in get_proxy_upstream_entries(phase=phase) if len(upstream_ips(e)) > 1]
        self.assertTrue(retries, f"No proxy_next_upstream retry recorded after docker {docker_command}")
        for entry in retries:
            ips = upstream_ips(entry)
            statuses = [s.strip() for s in entry["upstream_status"].split(",")]
            self.assertIn(victim["ip"], ips[:-1], f"Retry did not originate from the dead replica: {entry}")
            self.assertEqual(ips[-1], survivor["ip"], f"Retry did not end on the surviving replica: {entry}")
            self.assertEqual(statuses[-1], "200", f"Retried request did not succeed: {entry}")
            self.assertTrue(all(s.startswith("5") for s in statuses[:-1]), f"Unexpected attempt status: {entry}")

        # 3. Once fail_timeout has expired, NGINX would try the dead replica again if it were still in the
        # upstream pool. Waiting until both fail_timeout (counted from the last failed attempt, which happened
        # before the load stopped) and the resolver TTL have passed proves the resolver removed it.
        deadline = max(load_stopped_at + fail_timeout, stopped_at + resolver_valid) + 1
        time.sleep(max(0.0, deadline - time.monotonic()))
        pruned_phase = f"{phase}_pruned"
        for i in range(20):
            status, body = query_proxy(self.base_url, self.token, phase=pruned_phase)
            self.assert_me(status, body, f"Post-pruning request {i}")
        entries = get_proxy_upstream_entries(phase=pruned_phase)
        self.assertTrue(entries, f"Expected log entries for {pruned_phase}")
        for entry in entries:
            self.assertEqual(upstream_ips(entry), [survivor["ip"]], f"Dead replica still in upstream pool: {entry}")
            self.assertEqual(entry["upstream_status"], "200")

    def test_01_token_claims(self) -> None:
        """Verifies JWT signature algorithm and payload claims match the OIDC provider configuration."""
        self.assertEqual(self.header.get("alg"), "RS256")
        expected_issuer = f"{self.base_url}/auth/application/o/{self.client_id}/"
        self.assertEqual(self.payload.get("iss"), expected_issuer)
        self.assertEqual(self.payload.get("aud"), self.client_id)
        self.assertEqual(self.payload.get("name"), "Development user")
        self.assertEqual(self.payload.get("email"), "dev@taramisu.localhost")
        self.assertTrue(self.payload.get("sub"), "Missing sub claim in JWT")

        exp = self.payload.get("exp", 0)
        iat = self.payload.get("iat", 0)
        self.assertEqual(
            exp - iat,
            600,
            f"Expected token validity to be 600s (10 min), got {exp - iat}s",
        )

    def test_02_each_replica_accepts_token_directly(self) -> None:
        """Verifies each replica directly validates the JWT via its container IP and resolves identical iam_user."""
        for r in self.replicas:
            status, body = query_replica_direct(r["network"], r["ip"], self.token)
            self.assert_me(status, body, f"Replica {r['name']} ({r['ip']})")
            self.assertEqual(body.get("subject"), self.payload.get("sub"))
            self.assertEqual(body.get("email"), "dev@taramisu.localhost")

    def test_03_rejects_missing_or_tampered_token(self) -> None:
        """Verifies the backend enforces token authentication both via proxy and directly."""
        tampered = self.token[:-2] + ("b" if self.token[-2] != "b" else "c") + self.token[-1]

        # 1. Via NGINX proxy
        status_no_token, _ = query_proxy(self.base_url, None, phase="auth_check")
        self.assertEqual(status_no_token, 401, "Expected 401 Unauthorized for missing token via proxy")

        status_tampered, _ = query_proxy(self.base_url, tampered, phase="auth_check")
        self.assertEqual(status_tampered, 401, "Expected 401 Unauthorized for tampered token via proxy")

        # 2. Directly against replica container
        target = self.replicas[0]
        direct_no_token, _ = query_replica_direct(target["network"], target["ip"], None)
        self.assertEqual(direct_no_token, 401, "Expected 401 Unauthorized directly for missing token")

        direct_tampered, _ = query_replica_direct(target["network"], target["ip"], tampered)
        self.assertEqual(direct_tampered, 401, "Expected 401 Unauthorized directly for tampered token")

    def test_04_load_distribution(self) -> None:
        """Verifies NGINX distributes sequential requests across both replicas."""
        for i in range(20):
            status, body = query_proxy(self.base_url, self.token, phase="distribution")
            self.assert_me(status, body, f"Request {i}")

        replica_ips = {r["ip"] for r in self.replicas}
        observed = {ip for e in get_proxy_upstream_entries(phase="distribution") for ip in upstream_ips(e)}
        self.assertEqual(observed, replica_ips, "Expected requests to be distributed across both replicas")

    def test_05_graceful_stop_failover(self) -> None:
        """Verifies no failed requests, an NGINX retry, and resolver pruning when a replica stops (SIGTERM)."""
        self.assert_failover("stop", "graceful_stop")

    def test_06_crash_failover(self) -> None:
        """Verifies no failed requests, an NGINX retry, and resolver pruning when a replica crashes (SIGKILL)."""
        self.assert_failover("kill", "crash")

    def test_07_restarted_replica_cold_cache_and_reintegration(self) -> None:
        """Verifies a restarted replica accepts tokens with a cold cache and NGINX balances to it again."""
        restarted = self.replicas[0]
        proc = subprocess.run(["docker", "stop", restarted["id"]], capture_output=True, text=True, check=False)
        self.assertEqual(proc.returncode, 0, f"docker stop {restarted['name']} failed: {proc.stderr}")

        scale_api(2)
        fresh_replicas = wait_for_api_replicas(2)
        self.assertIn(restarted["id"], {r["id"] for r in fresh_replicas}, "Stopped replica was not restarted")
        for r in fresh_replicas:
            wait_for_replica_ready(r["network"], r["ip"])

        # The restarted process starts with empty JWKS and IAM caches.
        for r in fresh_replicas:
            status, body = query_replica_direct(r["network"], r["ip"], self.token)
            self.assert_me(status, body, f"Replica {r['name']} ({r['ip']})")

        wait_for_nginx_to_resolve_both_replicas(
            self.base_url, self.token, {r["ip"] for r in fresh_replicas}, phase="reintegration"
        )


def main() -> int:
    interrupted = False

    def _sig_handler(sig: int, _frame: Any) -> None:
        nonlocal interrupted
        interrupted = True
        raise KeyboardInterrupt

    old_sigint = signal.signal(signal.SIGINT, _sig_handler)
    old_sigterm = signal.signal(signal.SIGTERM, _sig_handler)

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(MultiReplicaFailoverTest)
    runner = unittest.TextTestRunner(verbosity=2)
    res: unittest.TestResult | None = None
    cleanup_ok = True
    try:
        res = runner.run(suite)
    except KeyboardInterrupt:
        interrupted = True
        print("\n[stack_test] Interrupted by signal. Restoring stack...", file=sys.stderr)
    finally:
        signal.signal(signal.SIGINT, old_sigint)
        signal.signal(signal.SIGTERM, old_sigterm)
        if MultiReplicaFailoverTest.scaled:
            cleanup_ok = cleanup_stack(MultiReplicaFailoverTest.initial_replica_count)

    if interrupted:
        return 130
    if not cleanup_ok:
        print("[stack_test] FATAL: Stack cleanup failed to restore replica count!", file=sys.stderr)
        return 2
    return 0 if (res and res.wasSuccessful()) else 1


if __name__ == "__main__":
    sys.exit(main())
