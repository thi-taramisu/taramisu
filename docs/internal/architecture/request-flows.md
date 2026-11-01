# Request Flows – Taramisu

This document visualizes the most common request flows through the architecture described in
[architecture-overview.md](./architecture-overview.md). All flows assume the React SPA acts as a public OIDC client using Authorization Code
Flow with PKCE against Authentik (routed via NGINX under `/auth/`) and holds a short-lived OIDC access token (JWT) in memory.

---

## 1. Login (OIDC Authorization Code Flow + PKCE via Authentik Web UI)

```mermaid
sequenceDiagram
    autonumber
    actor U as User
    participant SPA as React SPA
    participant P as NGINX Reverse Proxy
    participant AS as Authentik Server

    U->>SPA: Open Taramisu
    SPA->>SPA: Generate code_verifier + code_challenge (S256)
    SPA->>P: Redirect to /auth/application/o/authorize/ (code_challenge, scopes: openid profile email)
    P->>AS: Forward (/auth/*)
    AS-->>U: Hosted Authentik Login / Registration Web UI
    U->>AS: Credentials (+ MFA)
    AS-->>SPA: 302 Redirect back to /auth/callback?code=...&state=...
    SPA->>P: POST /auth/application/o/token/ (code + code_verifier)
    P->>AS: Forward (/auth/*)
    AS-->>SPA: Access token (JWT: sub=user_uuid, name, email) + refresh token
    Note over SPA: Tokens kept in memory, short-lived access token (10 min), refreshed via refresh token
```

---

## 2. Authenticated API Request (Stateless JWT + Project RBAC)

Applies to every `/api/v1/*` call. The Go API cluster is 100% stateless across replicas and never trusts the client for authorization
decisions.

```mermaid
sequenceDiagram
    autonumber
    participant SPA as React SPA
    participant P as NGINX Reverse Proxy
    participant API as Go API (any replica)
    participant AS as Authentik Server
    participant DB as taramisu-db

    SPA->>P: GET /api/v1/projects/{id}/threats (Authorization: Bearer <JWT>)
    P->>API: Forward (least_conn LB + runtime DNS resolve)
    API->>API: Verify JWT signature (RS256) with cached JWKS, check exp/iss/aud and required claims (sub, name, email)
    opt JWKS not cached or unknown key id (kid)
        API->>AS: GET /auth/application/o/taramisu/jwks/
        AS-->>API: Public keys (cached in memory per replica)
    end
    opt External sub not in local sub->UUID TTL cache
        API->>DB: UpsertIAMUser(sub) -> internal iam_user.id (UUID)
        DB-->>API: UserID (cached in memory per replica)
    end
    API->>DB: Resolve role of UserID (direct or via group) on project {id}
    DB-->>API: e.g. EDITOR
    alt Role sufficient
        API->>DB: Query threats
        DB-->>API: Rows
        API-->>SPA: 200 OK + JSON
    else No or insufficient role
        API-->>SPA: 403 Forbidden / 404 Not Found
    end
```

---

## 3. Resolving User & Group Display Metadata (In-Memory TTL Cache)

The application database only stores `external_iam_sub` and `external_iam_group_id` (Zero PII in `taramisu-db`, Decision 5).
While the caller's own `name` and `email` are extracted directly from the validated JWT claims on every request, displaying metadata for
*other* project members or groups (e.g. "created by", role assignment lists) is resolved on-the-fly via Authentik's Core API and cached in
memory per replica with a short TTL (e.g. 10 minutes, Decision 8).

```mermaid
sequenceDiagram
    autonumber
    participant API as Go API (In-Memory TTL Cache)
    participant AS as Authentik Server

    API->>API: Lookup sub1, sub2 in local TTL cache
    Note over API: sub1 hit, sub2 miss
    API->>AS: GET /auth/api/v3/core/users/?uuid=sub2 (service token)
    AS-->>API: name, email
    API->>API: Store sub2 in local cache (TTL 10 min)
    API-->>API: Merge into response
```

> [!NOTE]
> This in-memory cache is used for **display purposes only**. Authorization never depends on cached Authentik data; `PROJECT_ROLE_ASSIGNMENT`
> is always queried live from `taramisu-db`.
