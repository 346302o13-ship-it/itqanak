# Roadmap

## Phase 1 — Foundation (complete)

Git and monorepo structure, Docker topology, configuration/secrets boundary, forward-only
database migrations, health endpoints, storage port, Worker heartbeat, backups and recovery
documentation.

## Phase 2 — Authentication (complete)

Email verification, password lifecycle, server-managed opaque sessions, account security
events, roles/permissions, protected Arabic account/admin surfaces, Redis throttling and an
encrypted authentication-email outbox.

## Phase 3 — Catalog and student requests (complete)

- Arabic service categories/catalog, safe pricing metadata and development seed.
- Student dashboard, server-side request list/search/filter/pagination, draft creation and
  edit, academic-integrity consent, submission and permitted cancellation.
- Per-student submission-key idempotency, human request numbers, centralized state machine,
  optimistic concurrency, append-only history, domain outbox events and audit integration.
- Private request attachments with safe filenames, per-file/count/aggregate limits,
  extension + declared MIME + detected-content validation, bounded OOXML inspection,
  streaming SHA-256 and Local/S3 adapters.
- `FILE_SCAN_MODE`, optional ClamAV development profile, required production ClamAV, scan
  jobs/retries/readiness and referenced-object reconciliation.

Phase 3 does not include a complete admin workflow, chat, quote, payment, product
notification or Cloudflare production rollout.

## Phase 4 — Administration and workflow

Admin request management, assignment workflow, staff actions, internal request controls,
deadlines, search/filters and audited authorization. The existing `/ar/admin` boundary stays
protected by application RBAC and will gain request operations here.

## Phase 5 — Unified request chat

One student/admin conversation per request with text, image, audio, file and system messages,
plus read/delivery states. Message attachments will reuse and extend the private storage,
validation, scanning and IDOR controls delivered for request attachments in Phase 3.

## Phase 6 — Quotes and finance

Quotes, billing, credits, revisions, refunds/payment integration and an append-oriented
financial ledger with webhook idempotency and explicit authorization.

## Phase 7 — Product notifications

In-app, product email and WhatsApp notifications; Meta Cloud API/webhook states; consent,
recipient assignment, redaction, retries and idempotency. The existing Phase 2 email outbox
remains authentication-only until this phase.

## Phase 8 — Content and production hardening

CMS, reports, analytics, performance/security hardening, disaster-recovery exercise,
off-server backup validation and Cloudflare production controls.
