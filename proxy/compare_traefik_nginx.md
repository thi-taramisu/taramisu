# Proxy Manager Review: NGINX / Traefik
 
- **Date:** 21.10.2026
- **Decision:** based on this comparision -> nginx (more on that at the end)
## Context
 
One container must be the only published entrypoint (80/443) and do:
 
1. TLS termination
2. Path-based routing: `/` → frontend, `/api/*` → Go API, `/auth/*` → backend auth endpoints / Authentik
3. Load balancing across Go API replicas with Least Connections
4. Unbuffered SSE
## Comparison (free versions)
 
| Criterion | NGINX | Traefik |
|---|---|---|
| **Load balancing** | Yes: `round robin`, `least_conn`, `ip_hash` | Yes: `wrr`, `p2c`, `hrw`, `leasttime`. |
| **Least Connections** | **True `least_conn`.** With `zone`, counters live in shared memory and are exact across workers. | **No strict least-connections.** `p2c` picks two random servers and takes the one with fewer active connections (a close approximation); `leasttime` mixes latency with connections. |
| **Container discovery** | No Docker-event discovery| Native Docker provider |
| **Health / failover** | Passive only (`max_fails`, `proxy_next_upstream`) | Passive and active health checks |
| **SSE unbuffered streaming** | `proxy_buffering off` | Streams unbuffered by default (flushes immediately); long timeouts need entrypoint/transport settings. |
| **TLS / certificates** | Static cert files; automation via certbot or an external ACME client. | Built-in ACME |
| **Config effort** | One reviewable file | Labels on each service or a dynamic file |
| **Team familiarity** | The frontend container already runs an nginx config (as requested from the frontend team, see issuue #42), so the syntax is known. Moreover a nginx proxy is already configured by @ilyass -> avoid redundant work | New tool for the team. |
 
## Decision
 
**NGINX.** The deciding points:
 
1. **Least Connections is a hard requirement** and only NGINX offers the real algorithm for free. Traefik's `p2c` is probabilistic.
2. **The main gap container discovery is closed**::  by `resolve` in ≥ 1.27.3, which is enough for `docker compose --scale`.
3. **Team already knows nginx syntax**; one small config file is easy to review. Plus an already configured nginx is availble (at least the initial setup).
