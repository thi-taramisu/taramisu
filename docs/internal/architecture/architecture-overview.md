# System Architecture & Design Decisions – Taramisu

This document defines the target system architecture for the **Taramisu** web application (supporting the ISO/SAE 21434 TARA process). The architecture is designed around a **100% stateless backend tier** utilizing **Traefik** as a dynamic reverse proxy and load balancer.

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
        Traefik or ngninx ["Traefik (Container Auto-Discovery)<br/>• TLS Termination & Routing<br/>• Dynamic Load Balancing (Round-Robin)<br/>• SSE Support for AI Streams"]
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
    subgraph Data_Layer ["4. Persistence & Shared State Layer"]
        PG[("PostgreSQL (+ pgvector)<br/>• DB 1: taramisu_db (App & TARA Data)<br/>• DB 2: authentik_db (IAM Data)")]
        Redis[("Redis<br/>• IAM Metadata Cache<br/>• Rate Limiting<br/>• Async LLM Task Queue")]
        MinIO[("MinIO Object Storage (S3)<br/>• Architecture Diagrams<br/>• WP-09-01 / WP-10-01 Attachments")]
    end

    %% ==========================================
    %% CONNECTIONS & TRAFFIC FLOW
    %% ==========================================
    Client ==>|"HTTPS (:443)"| Traefik

    %% Edge Routing
    Traefik -->|"/* (Static Assets)"| FE
    Traefik -->|"/auth/* (OIDC Login & UI)"| AuthServer
    Traefik ==>|"/api/* (Dynamic Load Balancing)"| API1
    Traefik ==>|"/api/* (Dynamic Load Balancing)"| API2
    Traefik -.->|"/s3/* (Presigned URLs)"| MinIO

    %% Internal Service Communication
    API1 & API2 -.->|"JWKS Token Verify &<br/>User/Group Lookup API"| AuthServer
    API1 & API2 -->|"Internal gRPC / HTTP<br/>(RBAC-checked AI Requests)"| LLM

    %% Database & Storage Connections
    Atlas -->|"Applies SQL Migrations"| PG
    AuthServer & AuthWorker -->|"authentik_db"| PG
    AuthServer & AuthWorker -->|"Session / Task Broker"| Redis

    API1 & API2 -->|"SQL Queries (taramisu_db)"| PG
    API1 & API2 -->|"Distributed Cache"| Redis
    API1 & API2 -->|"S3 API (Upload / Presign)"| MinIO

    LLM -->|"RAG / Vector Search (pgvector)"| PG
    LLM -->|"Job Queue / Stream State"| Redis
    LLM -->|"Read Uploaded Docs"| MinIO
```

---

## 2. Key Architectural Decisions & Justifications

### 1. Traefik as Reverse Proxy & Load Balancer (Instead of NGINX)
* **Decision:** Use **Traefik** as the central entrypoint and load balancer.
* **Why:** Unlike traditional NGINX (which requires static configuration files and manual reloads when scaling containers), Traefik features **native Docker container auto-discovery**. When scaling the Go backend (`docker compose up --scale api=3`), Traefik automatically detects the new instances via the Docker socket and balances traffic instantly without changing configuration files. It also integrates smoothly with Authentik via Forward-Auth if needed.

### 2. 100% Stateless Go Backend (`1..N` Replicas)
* **Decision:** The Go backend holds no local sessions, files, or persistent state.
* **Why:** This allows seamless horizontal scaling behind Traefik's load balancer. If traffic increases or a container crashes, instances can be added or destroyed instantly without losing user data or session state.

### 3. PostgreSQL Database Isolation (`taramisu_db` vs. `authentik_db`)
* **Decision:** Share a single PostgreSQL instance for cost/ops efficiency, but use **strictly isolated logical databases**.
* **Why:** Running Authentik and the Taramisu core in separate databases (`authentik_db` and `taramisu_db`) prevents table name collisions and schema pollution while avoiding the overhead of running multiple database servers.

### 4. Zero PII in Application Database (Authentik Integration)
* **Decision:** Store only immutable external IDs (`external_iam_sub`, `external_iam_group_id`) in the Taramisu database.
* **Why:** Personal Identifiable Information (such as emails and display names) remains strictly within Authentik (Separation of Concerns / GDPR compliance). User metadata is resolved on-the-fly via Authentik’s core API and cached in Redis.

### 5. MinIO (S3-Compatible Object Storage) for File Uploads
* **Decision:** Store all binary files (architecture diagrams, PDFs, work products) in **MinIO** instead of the local container filesystem.
* **Why:** Storing files locally would break horizontal scaling behind a load balancer (since Replica #2 wouldn't have access to files uploaded to Replica #1). S3 storage ensures any backend instance can access any uploaded artifact.

### 6. Redis for Caching & Task Queuing
* **Decision:** Implement **Redis** as a shared distributed in-memory store.
* **Why:** It serves a dual purpose: caching Authentik user metadata across backend replicas to reduce API roundtrips, and acting as an asynchronous task queue/broker for future background jobs (such as long-running LLM text processing).

### 7. PostgreSQL with `pgvector` for Future AI / RAG Capabilities
* **Decision:** Use the `pgvector` extension inside the existing PostgreSQL container.
* **Why:** It prepares the architecture for future Retrieval-Augmented Generation (RAG) in the LLM assistant service (searching through uploaded TARA documents and standards) without introducing the operational complexity of a separate vector database.
