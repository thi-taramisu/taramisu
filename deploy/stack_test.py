"""Live multi-replica and failover verification against the running Compose stack.

Validates:
1. OIDC Authorization Code + PKCE flow against Authentik via NGINX.
2. Bearer JWT claims (alg, iss, aud, sub, name, email, validity).
3. Direct acceptance of the exact same JWT by each scaled replica (via container IP).
4. Direct and proxied rejection of missing or tampered tokens (401) on every replica.
5. Sequential requests through NGINX being served by both replicas.
6. No failed requests while a replica is stopped (SIGTERM) or killed (SIGKILL) under load,
   with the proxy_next_upstream retry recorded in the NGINX access log.
7. Removal of the dead replica from the upstream pool by the NGINX runtime resolver.
8. A replacement replica (rolling-deploy order) being picked up with a cold cache while NGINX drops the old one.

Timing assumptions (resolver valid=, fail_timeout=) are read from proxy/nginx.conf.
Usage: stack_test.py [--self-check | TEST ...]
  --self-check  check offline that proxy/nginx.conf still matches what this runner parses
  TEST          run only these tests, e.g. MultiReplicaFailoverTest.test_04_sigterm_stop_failover
"""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
import functools
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
# Same files as dev.sh and the Makefile, so compose sees the stack exactly as dev.sh started it.
COMPOSE_FILES = (SCRIPT_DIR / "compose.yaml", SCRIPT_DIR / "compose.dev.yaml")
PROXY_CONF = REPO_ROOT / "proxy" / "nginx.conf"

# Unique identifier for this test run so proxy access logs can be correlated
# strictly to test requests, preventing cross-contamination from other clients.
RUN_ID = uuid.uuid4().hex[:8]
UA_PREFIX = f"stack-test/{RUN_ID}/"

# Upper bounds for single docker invocations, so a hanging daemon fails the run instead of blocking it.
DOCKER_TIMEOUT = 60
COMPOSE_TIMEOUT = 180

# Matches proxy/nginx.conf 'log_format upstream_logging':
#   $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent
#   "$http_referer" "$http_user_agent" "$http_x_forwarded_for"
#   upstream: $upstream_addr status: $upstream_status response_time: $upstream_response_time request_id: $request_id
LOG_PATTERN = re.compile(
    r'"(?P<method>[A-Z]+)\s+(?P<uri>\S+)[^"]*"\s+(?P<http_status>\d+)\s+\d+\s+'
    r'"[^"]*"\s+"(?P<user_agent>[^"]*)"\s+"[^"]*"\s+'
    r'upstream:\s+(?P<upstream_addr>.+?)\s+status:\s+(?P<upstream_status>.+?)\s+response_time:\s+(?P<upstream_response_time>.+?)\s+request_id:\s+\S+'
)


class ComposeError(RuntimeError):
    """Raised when a docker or docker compose command exits with non-zero status."""


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


def read_log_format(path: Path = PROXY_CONF) -> str:
    """Returns the concatenated 'log_format upstream_logging' template from the proxy config."""
    text = path.read_text(encoding="utf-8")
    match = re.search(r"\blog_format\s+upstream_logging\s+((?:'[^']*'\s*)+);", text)
    if not match:
        raise RuntimeError(f"{path} must define 'log_format upstream_logging'")
    return "".join(re.findall(r"'([^']*)'", match.group(1)))


def _run(
    cmd: list[str],
    check: bool,
    timeout: float,
    new_session: bool,
    env: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(
        cmd,
        cwd=str(SCRIPT_DIR),
        env=env,
        capture_output=True,
        text=True,
        check=False,
        timeout=timeout,
        # A new session keeps terminal Ctrl-C away from commands that must not be interrupted halfway.
        start_new_session=new_session,
    )
    if check and proc.returncode != 0:
        raise ComposeError(
            f"Command failed (exit code {proc.returncode}): {' '.join(cmd)}\n"
            f"STDOUT:\n{proc.stdout}\n"
            f"STDERR:\n{proc.stderr}"
        )
    return proc


def run_compose(*args: str, check: bool = True, new_session: bool = False) -> subprocess.CompletedProcess[str]:
    files = [arg for path in COMPOSE_FILES for arg in ("-f", str(path))]
    cmd = ["docker", "compose", "--env-file", str(ENV_FILE), *files, *args]
    return _run(cmd, check, COMPOSE_TIMEOUT, new_session)


def run_docker(*args: str, check: bool = True, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return _run(["docker", *args], check, DOCKER_TIMEOUT, False, env)


def scale_api(count: int, new_session: bool = False) -> None:
    """Scales the api service without touching its dependencies or recreating running replicas."""
    run_compose("up", "-d", "--wait", "--no-deps", "--no-recreate", f"--scale=api={count}", "api", new_session=new_session)


def docker_now() -> datetime:
    """Returns the Docker daemon's clock, which stamps container logs (it can drift from the host's)."""
    raw = run_docker("info", "--format", "{{.SystemTime}}").stdout.strip()
    # Go prints up to nine fractional digits and 'Z'; datetime.fromisoformat needs exactly six and an offset.
    raw = re.sub(r"\.(\d+)", lambda m: "." + (m.group(1) + "000000")[:6], raw).replace("Z", "+00:00")
    return datetime.fromisoformat(raw)


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


def decode_body(data: str) -> dict | str:
    """Returns a JSON response body as dict and anything else as text."""
    try:
        return json.loads(data)
    except ValueError:
        return data


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

    # Verify session authentication; urlopen raises for any non-2xx status.
    try:
        with opener.open(urllib.request.Request(f"{base}/auth/api/v3/core/users/me/"), timeout=20) as resp:
            resp.read()
    except urllib.error.HTTPError as e:
        raise RuntimeError(
            f"Authentik login as '{username}' failed (users/me returned HTTP {e.code}); check DEV_PASSWORD in iam/.env"
        ) from e

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
    with no_redir_opener.open(urllib.request.Request(auth_url), timeout=20) as auth_resp:
        loc = auth_resp.headers.get("Location")
        auth_status = auth_resp.status
    if not loc:
        raise RuntimeError(f"Expected redirect Location header from authorize endpoint, got status {auth_status}")

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


def compose_ids(service: str) -> list[str]:
    return run_compose("ps", "-q", service).stdout.split()


@functools.cache
def proxy_container() -> str:
    """Returns the proxy container ID; the runner never recreates the proxy, so it is looked up once."""
    ids = compose_ids("proxy")
    if len(ids) != 1:
        raise RuntimeError(f"Expected exactly one running proxy container, found {len(ids)}")
    return ids[0]


@functools.cache
def get_shared_network() -> str:
    """Returns the one network that NGINX uses to reach the api replicas."""
    api_ids = compose_ids("api")
    if not api_ids:
        raise RuntimeError("api must be running to determine the network it shares with the proxy")
    proxy_info, api_info = json.loads(run_docker("inspect", proxy_container(), api_ids[0]).stdout)
    common = sorted(
        set(proxy_info["NetworkSettings"]["Networks"]) & set(api_info["NetworkSettings"]["Networks"])
    )
    if len(common) != 1:
        raise RuntimeError(f"Expected exactly one network shared by proxy and api, found {common}")
    return common[0]


def get_api_replicas() -> list[dict[str, str]]:
    """Returns running api replicas (id, name, ip) with their address on the proxy network."""
    cids = compose_ids("api")
    if not cids:
        return []
    network = get_shared_network()
    replicas: list[dict[str, str]] = []
    for info in json.loads(run_docker("inspect", *cids).stdout):
        # A replica that is shutting down may already have left the network; NGINX cannot reach it either.
        ip = info["NetworkSettings"]["Networks"].get(network, {}).get("IPAddress", "")
        if ip:
            replicas.append({"id": info["Id"], "name": info["Name"].lstrip("/"), "ip": ip})
    return replicas


def wait_for_api_replicas(expected_count: int, timeout: float = 30.0) -> list[dict[str, str]]:
    """Polls until the expected count of api replicas are running and attached to the proxy network."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        replicas = get_api_replicas()
        if len(replicas) == expected_count:
            return replicas
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for {expected_count} api replicas; current: {get_api_replicas()}")


def query_replica_direct(ip: str, token: str | None = None, path: str = "/api/v1/me") -> tuple[int, dict | str]:
    """Queries an api replica on its container IP from inside the proxy container, bypassing NGINX.

    The bearer token reaches the proxy container through the environment ('docker exec -e AUTH_TOKEN'),
    which keeps it out of the docker CLI's argv. Once the shell there expands it, it is in wget's argv, which a Linux host
    can see in its process list; the development token is short-lived, so this is acceptable for tests.
    """
    env = os.environ.copy()
    exec_args = ["exec"]
    header = ""
    if token:
        env["AUTH_TOKEN"] = f"Bearer {token}"
        exec_args += ["-e", "AUTH_TOKEN"]
        header = '--header "Authorization: $AUTH_TOKEN" '
    # BusyBox wget writes the response headers (-S) to stderr and the body to stdout.
    cmd = f"wget -S -O - {header}http://{ip}:8080{path}"
    proc = run_docker(*exec_args, proxy_container(), "sh", "-c", cmd, check=False, env=env)
    status = re.search(r"HTTP/\d\.\d\s+(\d{3})", proc.stderr)
    return (int(status.group(1)) if status else 0), decode_body(proc.stdout.strip())


def wait_for_replica_ready(ip: str, timeout: float = 15.0) -> None:
    """Polls a replica's /health/ready endpoint directly until ready."""
    deadline = time.monotonic() + timeout
    last_code = 0
    last_body: dict | str = ""
    while time.monotonic() < deadline:
        last_code, last_body = query_replica_direct(ip, path="/health/ready")
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
    req.add_header("User-Agent", f"{UA_PREFIX}{phase}")
    if token is not None:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, decode_body(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, decode_body(e.read().decode("utf-8", errors="replace"))
    except Exception as e:
        return 0, str(e)


class LoadGenerator(threading.Thread):
    """Sends tagged proxied requests every few milliseconds until stopped and records every response."""

    def __init__(self, base_url: str, token: str, phase: str, interval: float = 0.01) -> None:
        super().__init__(daemon=True)
        self.base_url = base_url
        self.token = token
        self.phase = phase
        self.interval = interval
        self.results: list[tuple[int, dict | str]] = []
        self._halt = threading.Event()

    def run(self) -> None:
        while not self._halt.is_set():
            self.results.append(query_proxy(self.base_url, self.token, phase=self.phase))
            self._halt.wait(self.interval)

    def stop(self) -> bool:
        """Stops the thread and returns whether it ended; it does not raise, so callers may use it in finally."""
        self._halt.set()
        self.join(timeout=10)
        return not self.is_alive()


def upstream_ips(entry: dict[str, str]) -> list[str]:
    """Returns the upstream IPs NGINX tried for a request, in attempt order."""
    return [part.strip().split(":")[0] for part in entry["upstream_addr"].split(",")]


def upstream_statuses(entry: dict[str, str]) -> list[str]:
    """Returns the upstream status of each attempt, in the same order as upstream_ips."""
    return [s.strip() for s in entry["upstream_status"].split(",")]


def served_by(entry: dict[str, str]) -> str:
    """Returns the replica IP that answered a request with 200, or '' if no attempt succeeded."""
    return upstream_ips(entry)[-1] if upstream_statuses(entry)[-1] == "200" else ""


def parse_upstream_entries(lines: list[str], phase: str) -> list[dict[str, str]]:
    """Extracts access-log entries tagged with this run's RUN_ID and phase."""
    entries: list[dict[str, str]] = []
    for line in lines:
        if UA_PREFIX not in line:
            continue
        m = LOG_PATTERN.search(line)
        if not m:
            # NGINX's default format also logs the User-Agent, so a proxy on a stale config shows up here.
            raise RuntimeError(
                "A request tagged by this run was logged in a format the runner cannot parse; the proxy is "
                "probably running an older proxy/nginx.conf. Run 'python3 deploy/stack_test.py --self-check' "
                f"and reload the proxy (make -C deploy up).\nLine: {line}"
            )
        if m.group("user_agent") == f"{UA_PREFIX}{phase}":
            entries.append(m.groupdict())
    return entries


def log_cursor() -> str:
    """Returns a docker logs --since value for now on the Docker daemon's clock.

    Callers take it before sending a phase's requests, so each poll reads only that phase's log lines.
    The one-second margin covers clock rounding.
    """
    now = datetime.now(timezone.utc) + STACK.clock_offset - timedelta(seconds=1)
    return now.strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def get_proxy_upstream_entries(phase: str, since: str) -> list[dict[str, str]]:
    """Returns the proxy access-log entries tagged for phase that were written after since."""
    # NGINX writes the access log to stdout and the error log to stderr, which docker logs keeps apart.
    res = run_docker("logs", f"--since={since}", proxy_container())
    return parse_upstream_entries(res.stdout.splitlines(), phase)


def wait_for_proxy_entries(phase: str, expected: int, since: str, timeout: float = 10.0) -> list[dict[str, str]]:
    """Polls the asynchronous Docker log pipeline until every request sent for phase has been logged."""
    deadline = time.monotonic() + timeout
    while True:
        entries = get_proxy_upstream_entries(phase, since)
        if len(entries) >= expected:
            return entries
        if time.monotonic() > deadline:
            raise AssertionError(
                f"Only {len(entries)} of {expected} requests for phase '{phase}' appeared in the proxy access log"
            )
        time.sleep(0.5)


def wait_for_nginx_to_serve(replica_ips: set[str], phase: str, timeout: float = 25.0) -> None:
    """Sends requests tagged with phase until each replica IP has answered one of them with 200."""
    since = log_cursor()
    deadline = time.monotonic() + timeout
    seen_ips: set[str] = set()
    while time.monotonic() < deadline:
        query_proxy(STACK.base_url, STACK.token, phase=phase)
        seen_ips.update(served_by(e) for e in get_proxy_upstream_entries(phase, since))
        if replica_ips <= seen_ips:
            return
        time.sleep(0.5)
    raise TimeoutError(
        f"NGINX did not get a 200 from every replica {replica_ips} within {timeout}s; "
        f"served by {seen_ips - {''}}"
    )


def proxy_ready(base_url: str, attempts: int, delay: float) -> bool:
    """Polls /health/ready through NGINX until it returns 200."""
    for _ in range(attempts):
        try:
            with urllib.request.urlopen(f"{base_url}/health/ready", timeout=3) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(delay)
    return False


def cleanup_stack(initial_count: int) -> bool:
    """Restores the api service to its initial replica count and waits until NGINX serves it again."""
    try:
        scale_api(initial_count, new_session=True)
        # Until the resolver TTL expires, NGINX may still route to a replica that was just removed.
        if not proxy_ready(STACK.base_url, attempts=10, delay=1):
            print("Warning: api is not ready through NGINX after restoring the replica count", file=sys.stderr)
            return False
        return True
    except BaseException as e:  # main() ignores signals here, but no failure may skip the warning.
        print(f"Warning: stack cleanup failed: {e!r}", file=sys.stderr)
        return False


def self_check() -> int:
    """Checks offline that proxy/nginx.conf still matches the timings and log format this runner parses."""
    fail_timeout, resolver_valid = read_proxy_timings()
    values = {
        "remote_addr": "172.18.0.1",
        "remote_user": "-",
        "time_local": "06/Nov/2026:10:00:00 +0000",
        "request": "GET /api/v1/me HTTP/1.1",
        "status": "200",
        "body_bytes_sent": "42",
        "http_referer": "-",
        "http_user_agent": f"{UA_PREFIX}self_check",
        "http_x_forwarded_for": "-",
        "upstream_addr": "10.0.0.2:8080, 10.0.0.3:8080",
        "upstream_status": "502, 200",
        "upstream_response_time": "0.001, 0.002",
        "request_id": "0123456789abcdef0123456789abcdef",
    }
    try:
        line = re.sub(r"\$(\w+)", lambda m: values[m.group(1)], read_log_format())
    except KeyError as e:
        raise RuntimeError(f"log_format upstream_logging uses ${e.args[0]}; update LOG_PATTERN and self_check()") from None
    expected = {
        "method": "GET",
        "uri": "/api/v1/me",
        "http_status": "200",
        "user_agent": values["http_user_agent"],
        "upstream_addr": values["upstream_addr"],
        "upstream_status": values["upstream_status"],
        "upstream_response_time": values["upstream_response_time"],
    }
    entries = parse_upstream_entries([line], phase="self_check")
    if entries != [expected]:
        print(f"LOG_PATTERN does not match log_format upstream_logging:\n{line}\nparsed: {entries}", file=sys.stderr)
        return 1

    # A proxy still on NGINX's default 'combined' format must be reported, not silently skipped.
    stale = f'172.18.0.1 - - [06/Nov/2026:10:00:00 +0000] "GET /api/v1/me HTTP/1.1" 200 42 "-" "{UA_PREFIX}self_check"'
    try:
        parse_upstream_entries([stale], phase="self_check")
    except RuntimeError:
        pass
    else:
        print("A log line in NGINX's default format was not reported as a stale proxy config", file=sys.stderr)
        return 1
    print(f"stack_test self-check OK (fail_timeout={fail_timeout:g}s, resolver valid={resolver_valid:g}s)")
    return 0


class StackSession:
    """Login and stack state shared by all test classes, filled once by setUpModule()."""

    def __init__(self) -> None:
        self.base_url = "http://localhost"
        self.client_id = "taramisu"
        self.dev_password = ""
        self.token = ""
        self.header: dict[str, Any] = {}
        self.payload: dict[str, Any] = {}
        self.user_id = ""
        self.initial_replica_count = 1
        # Docker daemon clock minus host clock; container logs are stamped by the daemon.
        self.clock_offset = timedelta(0)
        # True once tests may change the replica count; main() restores the stack only then.
        self.restore_needed = False


STACK = StackSession()


def login() -> None:
    STACK.token = oidc_pkce_login(
        STACK.base_url, STACK.client_id, "dev", STACK.dev_password, f"{STACK.base_url}/auth/callback"
    )
    STACK.header, STACK.payload = decode_jwt(STACK.token)


def ensure_fresh_token(min_validity: float = 180.0) -> None:
    """Logs in again when the 10-minute token could expire during the next test (slow machines, long runs)."""
    # exp is wall-clock time, so this compares against time.time() rather than a monotonic clock.
    if STACK.payload.get("exp", 0) - time.time() < min_validity:
        login()


def setUpModule() -> None:
    if not ENV_FILE.is_file():
        raise RuntimeError(f"Missing environment file: {ENV_FILE}. Run deploy/dev.sh first.")

    env = read_env(ENV_FILE)
    STACK.dev_password = env.get("DEV_PASSWORD", "")
    if not STACK.dev_password:
        raise RuntimeError(f"DEV_PASSWORD not set in {ENV_FILE}. Run deploy/dev.sh first to provision Authentik.")

    # Configuration resolution: Shell environment takes precedence, followed by iam/.env,
    # matching Docker Compose variable interpolation semantics.
    STACK.base_url = (os.environ.get("APP_URL") or env.get("APP_URL") or "http://localhost").rstrip("/")
    STACK.client_id = os.environ.get("OIDC_CLIENT_ID") or env.get("OIDC_CLIENT_ID") or "taramisu"

    if not proxy_ready(STACK.base_url, attempts=15, delay=2):
        raise RuntimeError(f"Stack is not ready at {STACK.base_url}/health/ready. Start it with deploy/dev.sh first.")

    STACK.clock_offset = docker_now() - datetime.now(timezone.utc)
    login()

    status, body = query_proxy(STACK.base_url, STACK.token, phase="setup")
    if status != 200 or not isinstance(body, dict) or not body.get("id"):
        raise RuntimeError(f"Failed to resolve initial iam_user via /api/v1/me: status={status}, body={body}")
    STACK.user_id = str(body["id"])

    STACK.initial_replica_count = len(get_api_replicas()) or 1
    STACK.restore_needed = True


class TokenClaimsTest(unittest.TestCase):
    def test_token_claims(self) -> None:
        """Verifies JWT signature algorithm and payload claims match the OIDC provider configuration."""
        self.assertEqual(STACK.header.get("alg"), "RS256")
        self.assertEqual(STACK.payload.get("iss"), f"{STACK.base_url}/auth/application/o/{STACK.client_id}/")
        self.assertEqual(STACK.payload.get("aud"), STACK.client_id)
        self.assertEqual(STACK.payload.get("name"), "Development user")
        self.assertEqual(STACK.payload.get("email"), "dev@taramisu.localhost")
        self.assertTrue(STACK.payload.get("sub"), "Missing sub claim in JWT")

        validity = STACK.payload.get("exp", 0) - STACK.payload.get("iat", 0)
        self.assertEqual(validity, 600, f"Expected token validity to be 600s (10 min), got {validity}s")


class MultiReplicaFailoverTest(unittest.TestCase):
    replicas: list[dict[str, str]] = []

    def setUp(self) -> None:
        ensure_fresh_token()
        # Every test starts from two ready replicas that NGINX balances across, regardless of
        # what earlier tests stopped or killed.
        replicas = get_api_replicas()
        if len(replicas) != 2:
            scale_api(2)
            replicas = wait_for_api_replicas(2)
        for r in replicas:
            wait_for_replica_ready(r["ip"])
        wait_for_nginx_to_serve({r["ip"] for r in replicas}, phase=f"setup_{self._testMethodName}")
        self.replicas = replicas

    def assert_me(self, status: int, body: dict | str, context: str) -> None:
        self.assertEqual(status, 200, f"{context} failed with status {status}: {body}")
        self.assertIsInstance(body, dict, f"{context} returned a non-JSON body: {body}")
        self.assertEqual(body.get("id"), STACK.user_id, f"{context} resolved a different iam_user")

    def send_tagged_requests(self, phase: str, count: int = 20) -> list[dict[str, str]]:
        """Sends count sequential proxied requests, asserts each succeeded, and returns their log entries."""
        since = log_cursor()
        for i in range(count):
            status, body = query_proxy(STACK.base_url, STACK.token, phase=phase)
            self.assert_me(status, body, f"{phase} request {i}")
        return wait_for_proxy_entries(phase, count, since)

    def assert_failover(self, docker_command: str, phase: str) -> None:
        """Takes one replica down with docker_command under continuous load and verifies the failover."""
        fail_timeout, resolver_valid = read_proxy_timings()
        victim, survivor = self.replicas

        since = log_cursor()
        load = LoadGenerator(STACK.base_url, STACK.token, phase)
        load.start()
        try:
            time.sleep(0.5)
            run_docker(docker_command, victim["id"])
            stopped_at = time.monotonic()
            # Keep the load running past the resolver TTL so the replica is hit both before and after
            # Docker DNS drops its address.
            time.sleep(resolver_valid + 1)
        finally:
            load_ended = load.stop()
        load_stopped_at = time.monotonic()
        self.assertTrue(load_ended, "Load generator did not stop within 10s; its results would still change")

        # 1. Every request issued during the outage succeeded.
        self.assertTrue(load.results, "Load generator sent no requests")
        failed = [(s, b) for s, b in load.results if s != 200 or not isinstance(b, dict) or b.get("id") != STACK.user_id]
        self.assertEqual(failed, [], f"{len(failed)} of {len(load.results)} requests failed during failover")

        # 2. NGINX retried the dead replica on the survivor (proxy_next_upstream).
        entries = wait_for_proxy_entries(phase, len(load.results), since)
        retries = [e for e in entries if len(upstream_ips(e)) > 1]
        self.assertTrue(retries, f"No proxy_next_upstream retry recorded after docker {docker_command}")
        for entry in retries:
            ips, statuses = upstream_ips(entry), upstream_statuses(entry)
            self.assertIn(victim["ip"], ips[:-1], f"Retry did not originate from the dead replica: {entry}")
            self.assertEqual(served_by(entry), survivor["ip"], f"Retry did not succeed on the surviving replica: {entry}")
            self.assertTrue(all(s.startswith("5") for s in statuses[:-1]), f"Unexpected attempt status: {entry}")

        # 3. Once fail_timeout has expired, NGINX would try the dead replica again if it were still in the
        # upstream pool. Waiting until both fail_timeout (counted from the last failed attempt, which happened
        # before the load stopped) and the resolver TTL have passed proves the resolver removed it.
        deadline = max(load_stopped_at + fail_timeout, stopped_at + resolver_valid) + 1
        time.sleep(max(0.0, deadline - time.monotonic()))
        for entry in self.send_tagged_requests(f"{phase}_pruned"):
            self.assertEqual(upstream_ips(entry), [survivor["ip"]], f"Dead replica still in upstream pool: {entry}")
            self.assertEqual(entry["upstream_status"], "200")

    def test_01_each_replica_accepts_token_directly(self) -> None:
        """Verifies each replica directly validates the JWT via its container IP and resolves identical iam_user."""
        for r in self.replicas:
            status, body = query_replica_direct(r["ip"], STACK.token)
            self.assert_me(status, body, f"Replica {r['name']} ({r['ip']})")
            self.assertEqual(body.get("subject"), STACK.payload.get("sub"))
            self.assertEqual(body.get("email"), "dev@taramisu.localhost")

    def test_02_rejects_missing_or_tampered_token(self) -> None:
        """Verifies token authentication is enforced via NGINX and directly on every replica.

        Only the signature is tampered with here; issuer, audience, and expiry enforcement are covered by
        backend/internal/auth unit tests, because forging those claims needs the provider's signing key.
        """
        tampered = STACK.token[:-2] + ("b" if STACK.token[-2] != "b" else "c") + STACK.token[-1]

        status_no_token, _ = query_proxy(STACK.base_url, None, phase="auth_check")
        self.assertEqual(status_no_token, 401, "Expected 401 Unauthorized for missing token via proxy")
        status_tampered, _ = query_proxy(STACK.base_url, tampered, phase="auth_check")
        self.assertEqual(status_tampered, 401, "Expected 401 Unauthorized for tampered token via proxy")

        for r in self.replicas:
            direct_no_token, _ = query_replica_direct(r["ip"])
            self.assertEqual(direct_no_token, 401, f"Expected 401 for missing token on {r['name']}")
            direct_tampered, _ = query_replica_direct(r["ip"], tampered)
            self.assertEqual(direct_tampered, 401, f"Expected 401 for tampered token on {r['name']}")

    def test_03_sequential_requests_reach_both_replicas(self) -> None:
        """Verifies sequential requests through NGINX are served by both replicas.

        Without concurrent connections, least_conn picks replicas like round robin, so this checks that NGINX
        balances at all, not that it prefers the replica with fewer active connections.
        """
        served = {served_by(e) for e in self.send_tagged_requests("distribution")}
        self.assertEqual(served, {r["ip"] for r in self.replicas}, "Expected requests to be served by both replicas")

    def test_04_sigterm_stop_failover(self) -> None:
        """Verifies no failed requests, an NGINX retry, and resolver pruning when a replica is stopped (SIGTERM)."""
        self.assert_failover("stop", "sigterm_stop")

    def test_05_sigkill_crash_failover(self) -> None:
        """Verifies no failed requests, an NGINX retry, and resolver pruning when a replica is killed (SIGKILL)."""
        self.assert_failover("kill", "sigkill_crash")

    def test_06_replacement_replica_reintegration(self) -> None:
        """Verifies NGINX starts using a replacement replica and drops the replica it replaces.

        This follows a rolling deploy: start the replacement, then stop the old replica. Starting the new replica
        while both others still hold their addresses guarantees it a new IP, whatever Docker's address allocation.
        """
        _, resolver_valid = read_proxy_timings()
        old, kept = self.replicas

        scale_api(3)
        new = next(r for r in wait_for_api_replicas(3) if r["id"] not in {old["id"], kept["id"]})
        wait_for_replica_ready(new["ip"])
        # The new process starts with empty JWKS and IAM caches.
        status, body = query_replica_direct(new["ip"], STACK.token)
        self.assert_me(status, body, f"Replacement replica {new['name']} ({new['ip']})")
        wait_for_nginx_to_serve({old["ip"], kept["ip"], new["ip"]}, phase="scale_up")

        run_docker("stop", old["id"])
        # No request fails while nothing is sent, so the old replica is never marked down; after the resolver
        # TTL, only re-resolution can have removed it from the pool.
        time.sleep(resolver_valid + 1)
        entries = self.send_tagged_requests("after_replacement")
        for entry in entries:
            self.assertNotIn(old["ip"], upstream_ips(entry), f"Removed replica still in upstream pool: {entry}")
        self.assertEqual({served_by(e) for e in entries}, {kept["ip"], new["ip"]}, "Expected both remaining replicas to serve")


USAGE = """usage: stack_test.py [--self-check | TEST ...]
  --self-check  check offline that proxy/nginx.conf matches what this runner parses
  TEST          run only these tests, e.g. MultiReplicaFailoverTest.test_04_sigterm_stop_failover"""


def build_suite(names: list[str]) -> unittest.TestSuite | None:
    """Returns the suite for names (all tests if empty), or None if a name does not exist."""
    loader = unittest.TestLoader()
    if not names:
        return unittest.TestSuite([
            loader.loadTestsFromTestCase(TokenClaimsTest),
            loader.loadTestsFromTestCase(MultiReplicaFailoverTest),
        ])
    suite = loader.loadTestsFromNames(names, sys.modules[__name__])
    if loader.errors:
        print(f"stack_test.py: {loader.errors[0].strip().splitlines()[-1]}\n{USAGE}", file=sys.stderr)
        return None
    return suite


def main() -> int:
    args = sys.argv[1:]
    if args == ["--self-check"]:
        return self_check()
    if any(a.startswith("-") for a in args):
        print(USAGE, file=sys.stderr)
        return 2
    suite = build_suite(args)
    if suite is None:
        return 2

    interrupted = False

    def _sig_handler(sig: int, _frame: Any) -> None:
        nonlocal interrupted
        interrupted = True
        raise KeyboardInterrupt

    old_sigint = signal.signal(signal.SIGINT, _sig_handler)
    old_sigterm = signal.signal(signal.SIGTERM, _sig_handler)

    runner = unittest.TextTestRunner(verbosity=2)
    res: unittest.TestResult | None = None
    cleanup_ok = True
    try:
        res = runner.run(suite)
    except KeyboardInterrupt:
        interrupted = True
    finally:
        # A second Ctrl-C or SIGTERM must not abort the restore halfway, e.g. after compose removed the extra
        # replica but before it restarted the stopped one, which would leave no api replica running.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        try:
            if STACK.restore_needed:
                if interrupted:
                    print("\n[stack_test] Interrupted. Restoring the stack; further signals are ignored.", file=sys.stderr)
                cleanup_ok = cleanup_stack(STACK.initial_replica_count)
        finally:
            signal.signal(signal.SIGINT, old_sigint)
            signal.signal(signal.SIGTERM, old_sigterm)

    if not cleanup_ok:
        print("[stack_test] FATAL: Stack cleanup failed to restore replica count!", file=sys.stderr)
        return 2
    if interrupted:
        return 130
    return 0 if (res and res.wasSuccessful()) else 1


if __name__ == "__main__":
    sys.exit(main())
