# Architecture

## Purpose

ITQANAK is an Arabic-first (`ar`, RTL) platform foundation for legitimate educational support. Phase 1 deliberately contains no student accounts, real orders, payment processing, email delivery, or WhatsApp traffic. It establishes the boundaries required to add them safely.

```text
Browser / Cloudflare (future)
             |
     127.0.0.1:8080
        Nginx gateway
             |
       Next.js web app
        |            |
 PostgreSQL <----> Redis
        ^            ^
        |            |
        +---- Worker-+
             |
  private object storage / ClamAV (future file flow)
```

Only `gateway` publishes a port, bound to loopback. PostgreSQL, Redis, ClamAV, MinIO, Web, and Worker use internal Docker networks. The future public and administrative domains are `itqanqhelpstudent.online` and `admin.itqanqhelpstudent.online`; Cloudflare is not connected in this phase.

## Repository shape

| Area                     | Responsibility                                                                            |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `apps/web`               | Next.js App Router, Arabic placeholder UI, safe errors, liveness and readiness endpoints. |
| `apps/worker`            | Graceful process, database/Redis connectivity, heartbeat, future outbox seam.             |
| `packages/config`        | Strict startup configuration, production safeguards, `/run/secrets` support.              |
| `packages/core`          | Roles, centralized request state machine, JSON/outbox contracts.                          |
| `packages/db`            | Raw `postgres.js` client and forward-only migration runner.                               |
| `packages/auth`          | Authorization primitives only; credentials and sessions are Phase 2.                      |
| `packages/observability` | Structured JSON logger and recursive redaction.                                           |
| `packages/storage`       | Private local/S3-compatible object-store abstraction and upload allowlists.               |
| `packages/ui`            | Shared design tokens and minimal reusable React components.                               |

All TypeScript projects use strict mode, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`. Domain state rules remain in `packages/core`, not in a page component or route handler.

## Configuration and secrets

Services call `loadConfig()` at startup. Development can explicitly load `.env`; production cannot. Values may come from `NAME_FILE` only when that path resolves inside `/run/secrets`, or from a conventional `/run/secrets/name` Docker secret. Errors name only the invalid setting—never its value or file path. The config layer rejects HTTP public URLs and common placeholder values in production.

No secret belongs in a Dockerfile, compose file, git, `.env.example`, logs, or browser storage. The phase does not define a browser token transport; Phase 2 will use server-managed, `HttpOnly`, `Secure`, `SameSite` sessions.

## Database and migrations

`schema_migrations` is an internal ledger with an identity id, filename, SHA-256 checksum, timestamp, and execution duration. The runner reads sorted `NNN_name.sql` files, verifies applied files still exist and match their checksums, holds a PostgreSQL advisory lock, runs each unapplied file inside its own transaction, inserts its ledger row only in that transaction, and rejects pending, missing, changed, or failed migrations in `db:verify`.

The first migration creates only platform metadata, a durable outbox table, and worker heartbeats. Product tables must arrive in later forward-only files.

## Readiness contract

`/api/health/live` returns `200` while the web process is alive. `/api/health/ready` returns `200` only when configuration, PostgreSQL, Redis, and the complete checked migration set are ready; it returns `503` otherwise. It reports boolean component results and a request ID, never connection strings or error messages. In production, Next instrumentation also verifies the migration ledger before the server accepts requests, so a direct image start or Web-only restart cannot bypass the migration gate.

The Worker writes a file heartbeat for container health only after successful PostgreSQL and Redis checks. Its container health check rejects a stale heartbeat. It handles `SIGTERM`/`SIGINT`, stops polling, closes Redis and PostgreSQL clients, and uses bounded jittered backoff rather than a hot loop.

## Files and malware scanning boundary

Objects have system-generated opaque keys; original file names are metadata, not paths. Development local storage is outside the web public tree and cannot issue a public URL. Production uses an S3-compatible adapter and short-lived download URLs after application authorization. The future file flow is:

```text
validate extension + declared type + size
  -> quarantine private object (PENDING_SCAN)
  -> independently inspect content and scan with ClamAV
  -> CLEAN / INFECTED / REJECTED
  -> application authorization -> signed short-lived download
```

The browser Content-Type is never authoritative. Future upload routes must sniff content, enforce per-file and aggregate request limits, and never serve active content from the application origin without isolation controls.

## Event and notification boundary

An aggregate mutation and its outbox event must be written in one database transaction. The Worker will later claim rows idempotently, retry transient failures with bounded exponential backoff and jitter, and send permanent or ambiguous failures to manual review/dead-letter handling. The current Worker does not send email, WhatsApp, or any external notification.

## Deployment model

Development Compose uses a loopback-only gateway and PostgreSQL `trust` on an internal network only. Production Compose removes bind mounts, uses multistage images, non-root application users, read-only roots where appropriate, tmpfs, capability dropping, resource limits, health checks, restart policies, and Docker secrets. A successful migration job gates Web and Worker startup.
