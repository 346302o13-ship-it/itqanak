# Recovered product scope

This document preserves recovered requirements so a host loss cannot erase product
knowledge. It distinguishes current implementation from future scope; a listed future item
is not evidence that its UI, API or provider integration exists.

## Product, localization and roles

- Product: **ITQANAK — إتقانك**.
- Arabic RTL is primary; English must remain addable without redesign.
- Historical public domain: `itqanqhelpstudent.online`.
- Historical administrative domain: `admin.itqanqhelpstudent.online`.
- Administrative route: `/ar/admin`.
- Roles: `VISITOR`, `STUDENT`, `ADMIN`, `SYSTEM`.
- Stack: Next.js, TypeScript, pnpm/Turborepo, PostgreSQL, Redis, Docker Compose, ClamAV,
  Web/Worker and shared Core/DB/Auth/Catalog/Requests/Storage packages.

The replacement uses an explicit private storage port. Development has a shared local
volume and opt-in MinIO profile; production configuration requires an external
S3-compatible private bucket.

## Public site and catalog

Phase 3 implements Arabic service-category listing and service details at `/ar/services`,
with active-only queries, catalog pricing metadata, semantic Arabic pages, canonical/
OpenGraph metadata and active service sitemap entries. An explicit development/test seed
provides legitimate sample services and refuses production.

Future public content still includes a complete landing experience, FAQ, privacy, terms,
academic-integrity and contact pages, CMS-managed content, English localization and wider
content SEO. Catalog base price is informational; quote/invoice/payment behavior is not
implemented.

## Student account and portal

Phase 2 implements registration/verification, sign-in/out, recovery, server-managed session
management, display-name profile, Terms/Privacy acceptance, RBAC and security audit. Tokens
and sessions never use `localStorage`.

Phase 3 implements `/ar/student` dashboard counts/recent requests, server-side request
search/filter/sort/pagination, new draft and request detail/history. Email change and richer
preferences remain later work.

## Service requests — implemented in Phase 3

Each request has a human number, internal UUID, owning student, active service, title,
description, deadline, urgency, optional budget/currency, language, academic level,
institution, privacy choice, policy acceptance/version, timestamps and optimistic version.

Creation uses a per-student UUID `submissionKey` plus payload fingerprint, so identical
retries return one request and changed reuse conflicts. Students can save/edit drafts, add or
remove eligible attachments, submit complete requests and cancel `DRAFT`/`SUBMITTED`.
Ownership predicates and RBAC prevent IDOR; stale versions fail rather than overwrite.

The centralized lifecycle is:

`DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `WAITING_FOR_STUDENT`, `QUOTED`, `ACCEPTED`,
`IN_PROGRESS`, `DELIVERED`, `REVISION_REQUESTED`, `COMPLETED`, `CANCELLED`, `REJECTED`.

Only student Phase 3 transitions have routes today. Administrative review, assignment,
quotes, execution, delivery and completion come later. Typed request events are append-only;
important domain events share the existing transactional outbox, and sensitive actions
enter the audit ledger.

## Administration — future workflow

The Phase 2 `/ar/admin` boundary is real and application-authorized, but request management
is not implemented. Phase 4 plans overview, student/request management, staff assignment,
deadline/overdue controls, search, filters, exports with explicit permissions and an
immutable-from-UI audit trail. Cloudflare Access is a future outer boundary and cannot
replace ADMIN authorization.

## Request conversation — future

Phase 5 plans one request-scoped student/admin conversation with `TEXT`, `IMAGE`, `AUDIO`,
`FILE` and `SYSTEM` messages, sender/time, delivery and separate read states. Polling or SSE
must work; WebSockets are optional rather than the only design. Message/files must reuse the
Phase 3 ownership, private storage and scanning boundaries.

## Request attachments — implemented in Phase 3

Local storage is development-only; production config requires private S3. Keys are opaque
and original names are metadata. The current allowlist is PDF, DOCX, PPTX, XLSX, UTF-8 TXT,
PNG and JPEG, with safe names, exact size, global/service count and aggregate limits,
extension + declared MIME + detected-content validation, bounded OOXML ZIP inspection,
streaming SHA-256 and no public object access.

`FILE_SCAN_MODE=disabled` is the development/test default and records
`SCAN_SKIPPED_DEVELOPMENT`, never clean. ClamAV is an opt-in `antivirus` development profile
and required for production Web/Worker. Worker jobs retry bounded failures; downloads require
owner authorization and `CLEAN` in production. Upload and delete use explicit DB states,
compensation and reconciliation because PostgreSQL and S3 are not ACID together.

Future hardening includes CDR/isolated previews where justified and the separate message-
attachment model.

## Notifications and WhatsApp — future only

Product notifications include in-app/email then WhatsApp, using a transactional outbox,
idempotency, safe retry, dead-letter/manual review and redacted logs. The implemented Phase 2
email outbox is authentication-only. No real Meta call exists.

Recovered non-secret configuration: phone-number ID `1260466807145770`, webhook path
`/api/integrations/whatsapp/webhook`, expected historical URL
`https://admin.itqanqhelpstudent.online/api/integrations/whatsapp/webhook`, and historical
template `new_service_request_ar1`. These do not prove current provider approval.

Future WhatsApp rules include consent and active-recipient recheck, minimal payloads without
student name/email/description, official Cloud API only, signature verification, successful
`wamid` persistence, redacted numbers, bounded 429/5xx retry, permanent 400 handling,
permission-blocked 401/403 handling and `UNKNOWN` after ambiguous post-send timeout without
blind resend.

## Financial operations — future

Quotes, invoices, payments, credits, revisions, refunds and an append-oriented ledger remain
Phase 6. No card data belongs in ITQANAK. Provider webhooks require signatures, idempotency,
explicit ambiguous outcomes and stronger authorization/two-person review for sensitive
adjustments.

## Academic integrity

The platform rejects impersonation, examination taking, cheating, bypassing institution
systems and plagiarized/stolen content. Legitimate services include teaching/explanation,
review and improvement, training, design/presentations, translation, formatting, research
guidance and lawful technical help. Phase 3 records the exact configured policy version and
acceptance timestamp at submission.

## Recovered failure modes and mandatory protections

The old system queried `request_kind` before its migration existed, causing PostgreSQL
SQLSTATE `42703` and an administrative outage. Some SQL was manual/partial, and code,
backups, files and conversations could be lost with one host.

The replacement therefore requires Git, forward-only checksummed migrations, advisory
locking, per-file transactions, deployment/readiness schema gates, external production
object storage, off-server database backups, object-storage protection, periodic restore
tests and documented recovery. A PostgreSQL backup alone cannot recover attachment bytes;
database and object recovery must be verified together without pretending they form one
cross-system transaction.

## Remaining phases

- Phase 4: admin request management, assignment, staff actions and internal controls.
- Phase 5: unified request chat and text/image/audio/file/system messages.
- Phase 6: quotes, billing, credits, revisions and financial ledger.
- Phase 7: in-app/email/WhatsApp product notifications and recipient/webhook workflow.
- Phase 8: CMS, reports, analytics, production hardening, disaster recovery and Cloudflare
  production controls.
