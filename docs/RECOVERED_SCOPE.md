# Recovered product scope

This document preserves the recovered requirements of the previous ITQANAK platform so a future host loss cannot erase product knowledge. It is a scope record, not evidence that every item is implemented in Phase 1.

## Product, localization, and roles

- Product name: **ITQANAK — إتقانك**.
- Arabic RTL is the primary language; English must be addable without redesign.
- Historical public domain: `itqanqhelpstudent.online`.
- Historical administrative domain: `admin.itqanqhelpstudent.online`.
- Historical administration route: `/ar/admin`.
- Roles: `VISITOR`, `STUDENT`, `ADMIN`, `SYSTEM`.
- Recovered stack: Next.js, TypeScript, pnpm, Turborepo, PostgreSQL, Redis, Docker Compose, ClamAV, a Web app, a Worker, Core/DB/Auth shared packages.
- Recovered service names: postgres, redis, clamav, file-storage-init, web, worker. The new stack replaces `file-storage-init` with an explicit storage boundary and optional MinIO development profile.

## Public site

The future public site includes an Arabic landing page, services and categories, informational pages, FAQ, privacy policy, terms and conditions, academic integrity policy, contact form, CMS-managed content, SEO metadata, sitemap and robots, plus English localization. Phase 1 supplies a temporary Arabic landing page and the metadata/sitemap/robots seams only.

## Student account

Future account features are email registration and verification, sign-in and sign-out, password recovery, session management, student profile, language and notification preferences, recorded consent to data processing, and a security audit trail for sensitive operations. Sessions and tokens must never be stored in `localStorage`.

## Service requests

A student request will eventually contain a human-readable request number, service type, category/subcategory, short title, detailed description, deadline, urgency, budget or estimated price, university/study level where needed, language, attached files, privacy choice, required consents, and a `submissionKey` to prevent browser double-submit.

The extensible lifecycle is `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `WAITING_FOR_STUDENT`, `QUOTED`, `ACCEPTED`, `IN_PROGRESS`, `DELIVERED`, `REVISION_REQUESTED`, `COMPLETED`, `CANCELLED`, and `REJECTED`. The exact legal transitions are centralized in the Core state machine, never scattered through the UI.

## Administration

The administrative dashboard will have Cloudflare Access as a future outer boundary and `ADMIN` authorization inside the application. Planned functions:

- overview dashboard, students, requests, team assignment, overdue tracking;
- request conversations and attachments;
- notifications, consents, services/prices, CMS content, and financial flows;
- immutable-from-UI audit trail;
- search, filters, pagination, exports with explicit permissions; and
- logs that do not expose sensitive data.

## Request conversation

One request-scoped conversation supports `TEXT`, `IMAGE`, `AUDIO`, `FILE`, and `SYSTEM` messages. Each message has sender, creation time, delivery state, student/admin read states, attachments, and system events. Authorization must prevent users from reading another request or bypassing access via direct attachment links. It must work over polling or SSE; WebSockets are optional later, not the sole delivery design.

## Files

Storage is abstracted. Local/MinIO are development-only; production is S3-compatible object storage. System-generated names are stored as keys and original names only as metadata. Required controls are extension/MIME allowlists, distrust of browser Content-Type, per-file/aggregate size limits, ClamAV scanning before availability, statuses `PENDING_SCAN`, `CLEAN`, `INFECTED`, `REJECTED`, private short-lived signed links, no public objects, no active content on the same origin without controls, and future PDF/DOCX CDR.

## Notifications and WhatsApp (future only)

Notifications include in-app and email delivery, then WhatsApp, using a transactional outbox, idempotency, safe retry, dead-letter/manual review, and structured redacted logs. WhatsApp must use the official WhatsApp Business Platform Cloud API only; no real Meta call is implemented now.

Recovered non-secret configuration: phone number ID `1260466807145770`, webhook path `/api/integrations/whatsapp/webhook`, expected webhook URL `https://admin.itqanqhelpstudent.online/api/integrations/whatsapp/webhook`, and historical template name `new_service_request_ar1`. These are configuration, not assumptions about current approval or availability.

Future WhatsApp rules:

- sequential assignment across configured Saudi team numbers;
- per-recipient consent, immediate disable, and active/consent re-check before every send;
- no student name, email, or request description in an external notification;
- only request number, service type, requested deadline, and protected admin link; student `wa.me` links require the student to press Send;
- dry-run mode, number redaction in logs, and persistence of successful `wamid`;
- webhook processing for `sent`, `delivered`, `read`, `failed` after `X-Hub-Signature-256` verification;
- a separate Verify Token and App Secret; System User Token from a secret file;
- 429/5xx exponential backoff with jitter (historical max eight attempts), 400 permanent failure, 401/403 blocked pending permission repair, timeout after request start marked `UNKNOWN` without automatic resend, at-least-once rather than exactly-once semantics, and correlation data linking callbacks.

## Financial operations

Future scope includes quotes, invoices, payments, student credit, logged financial adjustments, refund/credit, append-only ledger where possible, no card number storage, external gateway integration, idempotent payment webhooks, and explicit authorization/two-person review for sensitive operations.

## Academic integrity

The product must reject impersonation, taking examinations for a student, cheating or bypassing university systems, plagiarized/stolen content, and illegal work. Legitimate educational services include explanation/teaching, review and improvement, training, design/presentations, translation, formatting, research guidance, and lawful technical help.

## Recovered failure modes and mandatory protections

The old system lacked a clear Migration Runner. Code queried `request_kind` before its migration ran, producing PostgreSQL SQLSTATE `42703` and an administrative outage. Backups and code lived on the same server, some SQL was manual and partial, and server loss could destroy code, backups, files, and conversations together.

The replacement requires Git from the start, automatic forward-only migrations, `schema_migrations`, checksums, advisory locking, per-file transactions where possible, `pnpm db:migrate`, `pnpm db:status`, `pnpm db:verify`, deployment failure when migrations are pending, production Web schema compatibility checks, off-server automated backups with periodic restore testing, external production object storage, and a documented recovery process.
