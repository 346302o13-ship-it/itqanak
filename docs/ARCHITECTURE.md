# Architecture

## Purpose and current scope

ITQANAK is an Arabic-first (`ar`, RTL) platform for legitimate educational support. Phase
3 includes identity and server-side authorization, the public service catalog, the student
request portal, durable request history/outbox/audit records, and private request attachments
with local/S3 storage and environment-aware malware scanning. Payment, full chat, WhatsApp,
and administrative request workflow remain outside the current runtime.

```text
Browser / Cloudflare (future production edge)
                    |
             127.0.0.1:8080
               Nginx gateway
                    |
              Next.js Web
             /      |      \
     PostgreSQL   Redis   private object storage
          ^          ^              ^
          |          |              |
          +---------- Worker -------+
                         |
                      ClamAV
```

Only `gateway` publishes a host port. PostgreSQL, Redis, ClamAV, Web, and Worker remain on
internal networks. Development uses a shared private local volume by default; production
uses an external private S3-compatible bucket. MinIO and ClamAV are opt-in development
profiles named `storage` and `antivirus`; production requires ClamAV but publishes no port.

## Repository boundaries

| Area                     | Responsibility                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`               | Next.js App Router, Arabic catalog/student/account UI, protected form and raw-upload routes, SEO and health endpoints.             |
| `apps/worker`            | Heartbeat, auth email delivery, attachment scan jobs, referenced-object reconciliation, graceful shutdown and bounded backoff.     |
| `packages/config`        | Central parsing, scoped process requirements, production invariants, safe projection and Docker-secret resolution.                 |
| `packages/core`          | Roles, request validation/identifiers, the sole request transition matrix, JSON and outbox contracts.                              |
| `packages/db`            | Raw `postgres.js` client and checksummed forward-only migration runner.                                                            |
| `packages/auth`          | Credentials, opaque sessions, RBAC, CSRF helpers, throttling, security audit and auth-email outbox.                                |
| `packages/catalog`       | Active service-category queries and idempotent development seed.                                                                   |
| `packages/content`       | Validated bilingual page blocks, administrator RBAC, optimistic updates, and append-only content history.                          |
| `packages/finance`       | Request-linked dues, manually verified full-payment transitions, currency-separated reports, and an append-only ledger.            |
| `packages/operations`    | Audited maintenance/scanner desired state, least-privilege administrator updates, and runtime state reads.                         |
| `packages/requests`      | Student request transactions, ownership, idempotency, history/outbox/audit, attachments, scan processing, reconciliation and CLIs. |
| `packages/storage`       | Streaming private Local/S3 adapters, content validation and disabled/ClamAV scanner adapters.                                      |
| `packages/observability` | Structured JSON logging and recursive redaction.                                                                                   |
| `packages/ui`            | Shared design tokens and reusable React primitives.                                                                                |

Strict TypeScript settings apply across projects. Domain rules live in Core/services, not in
React components or HTTP routes.

## Configuration and secrets

Every process calls `loadConfig()` with explicit requirements. Web and Worker require
database, Redis, storage, and scanning. Migrator does not require S3/ClamAV; read-only or
auth-specific CLIs request only what they use. This prevents an unrelated production tool
from needing storage credentials while retaining fail-closed startup for file-capable
services.

Development/test default to `STORAGE_DRIVER=local` and `FILE_SCAN_MODE=disabled`.
Production file-capable services require `STORAGE_DRIVER=s3` and
`FILE_SCAN_MODE=clamav`; a configured S3 endpoint must be HTTPS. S3 credentials resolve
from protected Docker secret files. `SafeAppConfig` exposes limits, driver/scanner mode and
`academicIntegrityVersion`, but never credentials, internal host/port values or paths.

## Persistent model and migrations

The migration runner holds an advisory lock, verifies SHA-256 checksums and executes each
unapplied file and ledger insert in one PostgreSQL transaction. Phase 3 adds:

- `003_service_catalog.sql`: service categories, services and catalog permissions.
- `004_service_requests.sql`: request number sequence/function, requests, append-only
  events, request permissions and audit resource linkage.
- `005_request_attachments.sql`: private attachment metadata, independent storage/scan
  states, indexes and own-attachment permissions.

`service_request_events` rejects UPDATE, DELETE and TRUNCATE. Mutable current state remains
in `service_requests`; explainability comes from typed events. Object bytes never enter
PostgreSQL.

## Request transaction model

```text
authenticated principal
  -> permission + owner predicate
  -> validation + centralized transition policy
  -> request row lock / expected version compare
  -> request mutation + event + outbox + security audit (one DB transaction)
  -> response with the resulting version
```

Creation uses a per-student `submission_key` unique constraint plus a canonical payload
fingerprint. Identical retries return the original draft; key reuse with different data is a
conflict. Other mutations use optimistic concurrency and fail stale callers with 409.

Student queries always predicate on `student_user_id`; a foreign request/attachment is
reported as absent. State-machine permission is separate from RBAC and ownership. Phase 3
exposes draft update, submit and permitted cancellation only; later administrative
transitions are defined but have no incomplete route.

## Attachment and storage model

```text
validate owner/version/service policy
  -> validate name + size + extension + declared MIME + detected content
  -> DB PENDING_UPLOAD
  -> streaming object put + SHA-256
  -> DB STORED + PENDING_SCAN / SCAN_SKIPPED_DEVELOPMENT
  -> outbox scan job -> CLEAN / INFECTED / SCAN_ERROR
  -> application authorization -> private streamed download
```

Opaque keys are `requests/{requestId}/{attachmentId}/{random}`. Local mode writes outside
the Web public tree with restrictive permissions; S3 mode sets no public ACL. Current
downloads stream through application authorization. The S3 port can issue short-lived
signed downloads for a future policy without exposing credentials.

The Web route spools each bounded raw upload once to a private mode-0600 temporary file so it
can enforce the declared HTTP length before reserving attachment state without buffering the
body in RAM. OOXML additionally captures a bounded trailer because the ZIP central directory
is at the end; its parser limits expansion and entry count, requires the correct family parts
and rejects ZIP64, encryption, unsafe paths, symlinks and macro projects. The storage adapter
then streams the private spool while hashing it and the route removes the exact temporary file.

PostgreSQL and S3 are not one ACID resource. Upload/delete use explicit storage states,
best-effort compensation and a bounded reconciler for old DB-referenced
`UPLOAD_FAILED`/`DELETE_PENDING` rows and stale `PENDING_UPLOAD` crash windows. The
reconciler never bucket-lists or guesses keys, and permission/network failures are never
treated as not-found.

## Malware scanning and asynchronous work

`MalwareScanner` returns `CLEAN`, `INFECTED`, `ERROR`, or `SKIPPED_DEVELOPMENT`. Disabled
development mode never returns clean. ClamAV uses bounded TCP INSTREAM/PING operations.

Scan jobs reuse `outbox_events`. Workers claim with `SKIP LOCKED`, lease stale work, retry
with bounded exponential jitter, and fence completion with job attempt and attachment state
checks. Infected files transition to `DELETE_PENDING` before object removal; terminal
scanner failures remain unavailable and dead-lettered. Scan completion writes a typed
request event and increments the request version transactionally.

## Readiness and process lifecycle

`/api/health/live` reports process liveness. `/api/health/ready` succeeds only when config,
PostgreSQL, Redis, the complete migration ledger and the configured scanner are ready. It
reports scanner state only as `disabled-development`, `healthy`, `paused-stopped`, or
`unavailable`; the last causes 503. `paused-stopped` is successful only for an intentional
pause confirmed by the isolated host reconciler. It never returns endpoints, ports,
credentials or exception messages.

Production Next instrumentation verifies the migration ledger before accepting traffic.
Worker heartbeat requires PostgreSQL and Redis, plus ClamAV when configured and desired,
then updates the DB/file heartbeat. During a confirmed intentional pause the Worker keeps
non-scan work alive. SIGTERM/SIGINT stop polling and close clients; iteration failures use
bounded jittered backoff.

## Deployment and recovery boundary

Production Compose uses multistage images, non-root users, read-only roots where viable,
tmpfs, capability dropping, resource limits, health checks, restart policies and Docker
secrets. A successful migrator gates Web and Worker. Database backups and object-storage
protection are separate obligations: a PostgreSQL dump cannot recover attachment bytes.
