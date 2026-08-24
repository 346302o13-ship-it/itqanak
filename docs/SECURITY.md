# Security baseline

## Network and process boundary

- Gateway is the sole host-facing container and binds `127.0.0.1:8080`.
- PostgreSQL, Redis, ClamAV, MinIO, Web and Worker do not publish host ports.
- Production application containers run non-root, drop capabilities, enable
  `no-new-privileges`, use read-only roots where viable and receive only required tmpfs.
- Production secrets use Docker secret files below `/run/secrets`. Config errors never print
  a secret value or secret-file path.
- Backup/restore utilities translate database URLs into short-lived mode `0600` libpq service
  files and scrub URL/libpq variables before launching PostgreSQL clients; credentials do not
  appear in client argv or child environments.
- Structured logs redact passwords, tokens, authorization/cookie headers, email, phone,
  secrets and sensitive file/path fields. Request descriptions, file names/keys and bodies
  must not enter logs or event metadata.

## Authentication and authorization

Browser authentication is an opaque `selector.validator` server-side session cookie. The
production cookie uses the `__Host-` prefix; storage contains only a validator hash. JWT and
browser credential storage are not used.

State-changing forms validate Host, Origin, content type and a constant-time CSRF token.
Raw attachment uploads carry CSRF in a protected header and enforce an explicit
`Content-Length`. Redirects are local-only. Passwords use Argon2id; verification/reset links
are single-use opaque values stored only as hashes, and email payloads are AES-256-GCM
encrypted before entering the auth outbox.

RBAC and ownership are enforced in services, not inferred from UI visibility. Every student
request query includes the authenticated `student_user_id`; every attachment operation
joins or locks through that owned request. A foreign request or attachment returns the same
not-found class as an absent one, preventing IDOR enumeration. `/ar/admin` additionally
requires `admin.dashboard.view`; Cloudflare Access will be a later outer layer, not a
replacement for application authorization.

## Request integrity

- A unique `(student_user_id, submission_key)` plus canonical fingerprint prevents duplicate
  request creation and detects key reuse with changed data.
- Every mutation carries an expected `version`; stale edit, submit, cancel or attachment
  operations fail with 409 instead of overwriting concurrent work.
- Request transitions come only from the Core matrix. Passing a state-machine check does not
  bypass permission, ownership or business preconditions.
- `service_request_events` is append-only and rejects UPDATE, DELETE and TRUNCATE. Sensitive
  mutations also enter `security_audit_events`; integration work enters the transactional
  outbox with a unique idempotency key.
- Academic-integrity consent records the server-configured policy version and timestamp at
  submission; a stale or altered version is rejected.

## File boundary

- Objects are private. Original names are metadata; opaque keys use request/attachment UUIDs
  plus randomness and never contain a supplied path.
- Production requires private S3 configuration and `FILE_SCAN_MODE=clamav`. A configured S3
  endpoint must be HTTPS; access and secret keys come from protected secret files.
- Local storage is development-only, outside `public/`, with restrictive directory/file
  modes. S3 writes no public ACL and uses `application/octet-stream`.
- Uploads enforce a normalized safe name, positive exact length, global and service limits,
  allowlisted extension, matching declared MIME and detected content. OOXML uses a bounded
  central-directory parser rather than a `PK` substring check.
- Disabled development scanning records `SCAN_SKIPPED_DEVELOPMENT`, never `CLEAN`.
  Production downloads require `CLEAN`; current downloads stream through owner
  authorization with `no-store`, `nosniff`, CSP sandbox and attachment disposition.
- PostgreSQL and S3 are not ACID together. Explicit upload/delete states, compensation and a
  bounded DB-referenced reconciler preserve recoverability. Network/403 errors are never
  treated as object absence.

Antivirus and structural OOXML checks reduce risk but are not Content Disarm and
Reconstruction and cannot prove a document benign. PDF/DOCX CDR, deeper content inspection,
upload-specific rate limiting and isolated document rendering remain hardening work. Never
move `SCAN_SKIPPED_DEVELOPMENT` objects into production as clean.

## Scanner readiness

Development defaults to disabled scanning so readiness reports only
`disabled-development`. With ClamAV configured and desired, Web readiness and Worker
heartbeat require a successful bounded PING; `unavailable` fails readiness without exposing
host, port, response or signature. An intentional host-confirmed stop reports
`paused-stopped`, keeps pending files unavailable and does not weaken download policy.
Scanner errors retry to a configured limit and then become `SCAN_ERROR`/dead-letter, never
downloadable.

## Response and browser controls

Next.js provides CSP, `nosniff`, deny framing, a restrictive Permissions-Policy and HSTS in
production. Account, request and API responses are no-store. Current Next hydration requires
the documented first-party `unsafe-inline` exceptions for scripts/styles; do not broaden CSP
for a widget without a reviewed nonce/hash design.

Nginx access logs `$uri`, not query strings. Raw auth tokens live in URL fragments before a
client component moves them into a protected POST and clears the address bar, so request
lines do not contain them.

## Configuration classification

Non-secret examples include app/locale names, public URLs, upload limits, scanner mode,
policy version, S3 region/bucket/force-path-style and an HTTPS endpoint. Secrets include
database/Redis URLs containing passwords, auth-email keys, SMTP passwords, storage access
keys, Meta credentials, session/token material and TLS private keys. Store production secret
values in protected external files, not `.env`, Git, Compose YAML or printable CI variables.

## Controls for later phases

1. Put the administrative domain behind Cloudflare Access while retaining ADMIN checks.
2. Define permissions for assignment, exports, conversations, finance and each staff action.
3. Extend throttling and abuse controls to upload and integration endpoints.
4. Verify authentic signatures and idempotency for payment and WhatsApp callbacks; model
   ambiguous network outcomes explicitly.
5. Add CDR/isolated previewing where risk assessment requires it.
6. Keep notification payloads minimal and consent-aware; do not send descriptions or files
   to external providers.

## Vulnerability response

Contain exposure, preserve redacted evidence, rotate affected credentials, inspect access,
request and audit histories, patch with regression tests and document prevention. If a secret
reaches Git history, assume compromise and revoke it before discussing history rewriting.
