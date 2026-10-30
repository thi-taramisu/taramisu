# System Architecture & Design Decisions – Taramisu

This document defines the target system architecture for the **Taramisu** web application (supporting the ISO/SAE 21434 TARA process).
The architecture is designed around a **100% stateless backend tier** utilizing **NGINX** as the central reverse proxy and load balancer.

Typical request flows (login, authenticated API calls, file upload/download, LLM requests) are visualized in
[request-flows.md](./request-flows.md).

For the current registration and approval implementation, see
[Registration flow](iam/registration-flow.md).

---

## 1. System Architecture Diagram

```mermaid
flowchart TB
    %% ==========================================
    %% EXTERNAL ACTORS
    %% ==========================================
    Client([Browser / React SPA])

    %% ==========================================
    %% EDGE / INGRESS LAYER
    %% ==========================================
    subgraph Edge_Layer ["1. Edge & Ingress Layer (Reverse Proxy & Load Balancer)"]
        NGINX["NGINX (Open Source >= 1.28)<br/>• TLS Termination, Routing & Rate Limiting<br/>• Load Balancing (Least Connections + DNS Re-Resolution)<br/>• SSE Support for AI Streams (proxy_buffering off)"]
    end

    %% ==========================================
    %% APPLICATION & IAM LAYER
    %% ==========================================
    subgraph App_Layer ["2. Stateless Application & IAM Layer"]
        FE["Frontend Static Server<br/>(React SPA Bundle)"]

        subgraph IAM_Stack ["Identity & Access Management"]
            AuthServer["Authentik Server<br/>(OIDC / OAuth2 / JWKS)"]
            AuthWorker["Authentik Worker<br/>(Background Tasks)"]
        end

        subgraph Backend_Cluster ["Stateless Go API Cluster (Load Balanced)"]
            API1["Go Backend Replica #1<br/>(Huma OpenAPI / sqlc / RBAC)"]
            API2["Go Backend Replica #2<br/>(Huma OpenAPI / sqlc / RBAC)"]
        end

        LLM["LLM Assistant Service<br/>(Placeholder / Internal AI Microservice)<br/>Threat & Attack Path Suggestions"]
    end

    %% ==========================================
    %% INIT / MIGRATION JOBS
    %% ==========================================
    subgraph Init_Layer ["3. Init & Schema Management"]
        Atlas["Atlas Migration Runner<br/>(One-off Init Job before API startup)"]
    end

    %% ==========================================
    %% DATA & STATE LAYER
    %% ==========================================
    subgraph Data_Layer ["4. Persistence & Storage Layer"]
        AppDB[("PostgreSQL – taramisu-db<br/>(App & TARA Data)")]
        IAMDB[("PostgreSQL – authentik-db<br/>(IAM Data)")]
        ObjStore[("S3-Compatible Object Storage<br/>• Architecture Diagrams<br/>• Uploaded Documents")]
    end

    %% ==========================================
    %% CONNECTIONS & TRAFFIC FLOW
    %% ==========================================
    Client ==>|"HTTPS (:443)"| NGINX

    %% Edge Routing
    NGINX -->|"/* (Static Assets)"| FE
    NGINX -->|"/auth/* (OIDC Login & UI)"| AuthServer
    NGINX ==>|"/api/* (least_conn LB)"| API1
    NGINX ==>|"/api/* (least_conn LB)"| API2

    %% Internal Service Communication
    API1 & API2 -.->|"JWKS Token Verify &<br/>User/Group Lookup API"| AuthServer
    API1 & API2 -->|"Internal HTTP Stream<br/>(RBAC-checked AI Requests)"| LLM

    %% Database & Storage Connections
    Atlas -->|"Applies SQL Migrations"| AppDB
    AuthServer & AuthWorker -->|"SQL"| IAMDB

    API1 & API2 -->|"SQL Queries"| AppDB
    API1 & API2 -->|"S3 API (Upload / Stream Download)"| ObjStore
```

---

## 2. Network Segmentation

The container topology strictly separates ingress and persistence layers into dedicated Docker networks. NGINX is the sole service
attached to the non-internal `edge` network to publish host ports (`:80`, `:443`). All internal application routing occurs across the
`internal: true` `proxy` network, completely blocking outbound internet egress for the Go API and Frontend.

Every stateful or internal backend component sits in its **own isolated `internal: true` Docker network** shared only with the services
that directly require it. Databases, object storage, and the LLM service are **never** attached to the `edge` or `proxy` networks and
cannot be reached from the edge.

| Network | `internal` | Members | Purpose |
| --- | --- | --- | --- |
| `edge` | no | NGINX *(+ optional Authentik/LLM for egress)* | Ingress from host/internet (`ports:`) & outbound internet access (egress) |
| `proxy` | yes | NGINX, Frontend, Go API, Authentik Server | Internal ingress routing from NGINX & Go API $\leftrightarrow$ Authentik (no internet egress) |
| `app-db` | yes | Go API, Atlas, `taramisu-db` | Application database access |
| `iam-db` | yes | Authentik Server, Authentik Worker, `authentik-db` | IAM database access |
| `storage` | yes | Go API, Object Storage | S3-compatible object storage access |
| `llm` | yes | Go API, LLM Service | Internal AI requests (Placeholder) |

```mermaid
flowchart LR
    Host([Host / Internet]) ==>|":443"| Proxy["NGINX Reverse Proxy"]

    subgraph net_edge ["edge (internal: false — Host Ports & Optional Egress)"]
        Proxy
    end

    subgraph net_proxy ["proxy (internal: true — NO Internet Egress)"]
        Proxy --- FE["Frontend"]
        Proxy --- API["Go API (1..N)"]
        Proxy --- AS["Authentik Server"]
        API -.->|"JWKS & User Lookup<br/>(via internal proxy net)"| AS
    end

    API ---|app-db| AppDB[("taramisu-db")]
    Atlas["Atlas"] ---|app-db| AppDB

    AS ---|iam-db| IAMDB[("authentik-db")]
    AW["Authentik Worker"] ---|iam-db| IAMDB

    API ---|storage| ObjStore[("S3 Storage")]

    API ---|llm| LLM["LLM Service"]
```

> [!NOTE]
> Docker networks with `internal: true` have **no outbound internet access (egress)**. Because `proxy` is `internal: true`, neither the
> Go API nor the Frontend can initiate outbound connections to the internet (protecting against reverse shells and direct data
> exfiltration in case of compromise).
> Services that explicitly require egress in later phases (e.g. Authentik Worker for SMTP email delivery or external SSO/IdP federation,
> or the LLM service if connecting to an external THI model API from the production VM) will be attached additionally to `edge`.

---

## 3. Key Architectural Decisions & Justifications

### 1. NGINX (Open Source >= 1.28) with Least Connections Load Balancing

* **Decision:** Use **NGINX Open Source (stable >= 1.28)** as the central entrypoint, reverse proxy, and load balancer using the **Least
  Connections (`least_conn`)** balancing strategy and runtime DNS re-resolution (`resolve`).
* **Why:**
  * **Runtime Upstream Re-Resolution:** Since NGINX 1.28 (April 2025), the open-source version natively supports the `resolve` parameter in
    `upstream` blocks. Combined with Docker's internal DNS (`resolver 127.0.0.11`), NGINX dynamically picks up new container IPs when
    backend replicas restart, crash, or scale (`docker compose up --scale api=3`) without requiring manual reloads.
  * **Least Connections (`least_conn`):** Because the Go API handles a mix of fast JSON queries, multi-megabyte file streams, and
    long-lived Server-Sent Events (SSE) streams for LLM responses, `least_conn` ensures new requests are always routed to the replica with
    the fewest active in-flight connections.
  * **No Sticky Sessions Required:** While open-source NGINX lacks native cookie-based sticky sessions, our Go backend is 100% stateless
    (JWT-based auth, externalized storage in PostgreSQL and S3-compatible object storage), making session affinity unnecessary.
  * **Passive Health Checks:** NGINX's built-in passive health checks (`max_fails` / `fail_timeout`) automatically failover to healthy
    replicas if an instance becomes unresponsive, which is fully sufficient for our use case without needing active health probing.
  * **Edge Capabilities:** Handles TLS termination, rate limiting (`limit_req_zone`), upload size limits (`client_max_body_size`), and
    unbuffered SSE streaming (`proxy_buffering off`).

### 2. 100% Stateless Go Backend (`1..N` Replicas)

* **Decision:** The Go backend holds no local sessions, files, or persistent state.
* **Why:** This allows seamless horizontal scaling behind NGINX. If traffic increases or a container crashes, instances can be added or
  destroyed instantly without losing user data or session state.

### 3. Separate PostgreSQL Containers (`taramisu-db` vs. `authentik-db`)

* **Decision:** Run **two independent PostgreSQL containers**, one for the Taramisu application and one for Authentik, each in its own
  internal network (`app-db` / `iam-db`).
* **Why:** Full isolation of the IAM data from the application data: separate credentials, volumes, backups, upgrade cycles and resource
  limits. A compromised or misconfigured Go API has no network path to the Authentik database and vice versa. The additional operational
  overhead of a second PostgreSQL container is small compared to the security and lifecycle benefits.

### 4. Strict Network Segmentation & Outbound Egress Isolation

* **Decision:** Only NGINX is exposed on the non-internal `edge` network; the internal `proxy` network as well as all persistence networks
  (`app-db`, `iam-db`, `storage`, `llm`) are configured with `internal: true` (see [Section 2](#2-network-segmentation)).
* **Why:** Minimizes the attack surface and enforces least privilege on the network level. Each service can only reach the backends it
  actually needs, and application containers (Go API, Frontend) cannot initiate outbound connections to the internet, preventing reverse
  shells and direct data exfiltration in the event of container compromise.

### 5. Zero PII in Application Database (Authentik Integration)

* **Decision:** Store only immutable external IDs (`external_iam_sub`, `external_iam_group_id`) in the Taramisu database.
* **Why:** Personal Identifiable Information (such as emails and display names) remains strictly within Authentik (Separation of Concerns /
  GDPR compliance). User metadata is resolved on-the-fly via Authentik’s core API and cached in-memory with a short TTL.

### 6. S3-Compatible Object Storage for File Uploads

* **Decision:** Store all binary files (architecture diagrams, PDFs, uploaded documents) in a dedicated **S3-compatible object storage**
  instead of the local container filesystem. The object storage is **only reachable by the Go API** (`storage` network); clients never
  talk to the storage service directly.
* **Why:** Storing files locally would break horizontal scaling behind a load balancer (since Replica #2 wouldn't have access to files
  uploaded to Replica #1). Standard S3-compliant APIs ensure any backend instance can access any uploaded artifact via standard S3 client
  libraries, keeping the backend code decoupled from any specific storage implementation.
* **Engine Evaluation / Replacement:** Rather than coupling the setup to MinIO (which has become less suited due to maintenance /
  licensing considerations), the architecture treats object storage generically. Modern lightweight and actively maintained
  S3-compatible alternatives (such as **Garage** or **SeaweedFS**) are targeted and can be plugged in without requiring architectural
  or application-code adjustments.

### 7. File Access Authorization via the Go API

* **Decision:** Every file download goes through `GET /api/...` on the Go API. The API validates the JWT, resolves the file's owning
  `TARA_PROJECT`, checks the caller's `PROJECT_ROLE_ASSIGNMENT` and only then streams the object from the object storage to the client.
* **Why:** Authorization is enforced on **every** request in one place (the same RBAC logic as for all other resources) and revoked access
  takes effect immediately. The object storage stays fully internal. For the expected file sizes (diagrams, PDFs in the low MB range) and
  user count, streaming through the API is not a bottleneck.
* **Alternative (later, if needed):** The API performs the same RBAC check but answers with a redirect to a **short-lived presigned URL**
  (e.g. 60 s TTL). This offloads bandwidth from the API replicas but requires exposing the object storage via NGINX (e.g. under `/s3/*`) and
  means a URL that has already been issued stays valid until it expires.

### 8. Lean Caching Strategy (In-Memory per Replica, No External Cache Broker)

* **Decision:** Avoid introducing an external distributed cache (such as Redis) for the current architecture phase. Instead, use
  lightweight **in-memory TTL caches** inside each Go API replica alongside standard HTTP caching:

  | Mechanism | Scope & Justification |
  | --- | --- |
  | **In-memory TTL cache: JWKS keys** (per Go replica) | Standard OIDC library behavior with periodic refresh. |
  | **In-memory TTL cache: IAM metadata** (per Go replica) | Authentik user/group display metadata (`sub` → name, e-mail) cached for a short TTL (e.g. 5–10 min) for UI rendering. Even with multiple replicas, one initial lookup per replica every 10 minutes is negligible and avoids the operational overhead of running Redis. |
  | **Edge rate limiting** (NGINX) | Handled directly at the single NGINX ingress proxy (`limit_req_zone`) before traffic reaches the API replicas. |
  | **Browser HTTP caching** (`ETag` + `304`) | Used for file downloads (`Cache-Control: private`, `ETag = sha256`) so the browser revalidates access with the API on every request without re-transferring unchanged file blobs. |

* **Explicitly not cached:**
  * **Authorization decisions / project roles** – always read directly from `taramisu-db` so that revoked access takes effect immediately.
    These are fast indexed lookups.
  * **Future Extension:** If asynchronous background job queuing or cross-replica pub/sub becomes necessary in a later phase (e.g. for
    long-running background AI jobs), either a PostgreSQL-backed queue (`SKIP LOCKED` / River) or Redis can be introduced at that point.
