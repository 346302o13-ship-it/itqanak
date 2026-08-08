# Security baseline

## Current boundaries

- Gateway is the sole host-facing container and binds `127.0.0.1:8080`.
- PostgreSQL, Redis, ClamAV, and MinIO do not publish host ports.
- Production application containers run as non-root, drop Linux capabilities, enable `no-new-privileges`, use read-only roots where viable, and receive writable tmpfs only where required.
- Production secrets use Docker secret files. Config accepts only safe paths below `/run/secrets` and never prints a secret value or path.
- Structured logs redact passwords, tokens, authorization headers, cookies, secrets, email, phone, and sensitive file-path/name fields. Do not log full request or webhook bodies.
- Browser authentication is an opaque `selector.validator` session cookie. The production name has the `__Host-` prefix; server storage contains only a validator hash. JWTs and browser storage are not used.
- State-changing auth/account forms verify Host, Origin, form content type, and constant-time CSRF token matching. Redirects are local-only.
- Passwords are Argon2id hashes (19 MiB, time cost 2, parallelism 1), never logs or reversible storage. Registration, login/recovery, token confirmation, and sensitive account actions have Redis limits that fail closed when required.
- Verification/reset links are single-use opaque tokens whose raw values are never stored. Email links place the token in a URL fragment, which browsers do not send in HTTP request lines; a client component moves it into the protected POST form and immediately clears the address bar.
- Authentication email payloads are AES-256-GCM encrypted in the outbox, cleared after delivery, and never logged. SMTP is disabled by default.
- `/ar/admin` is a real protected surface only for an authenticated principal with `admin.dashboard.view`; UI redirects are not trusted as authorization.

## Required controls for later phases

1. Require authorization at every request, conversation, attachment, export, and direct-object link boundary.
2. Put the administrative domain behind Cloudflare Access and also verify `ADMIN` role in the application.
3. Extend CSRF protections and rate limiting to uploads and integration endpoints.
4. Keep files private, generate opaque object keys, validate size and type, sniff content, scan with ClamAV, and authorize before issuing a short-lived download URL.
5. Treat payment and WhatsApp callbacks as untrusted input. Verify authentic signatures, retain idempotency keys, redact payloads, and model ambiguous network results explicitly.
6. Use audit logs for sensitive actions; do not permit UI mutation of the audit ledger.
7. Rotate secrets after personnel changes, suspected disclosure, or disaster recovery. Do not reuse a development secret in production.

## Response headers

Next.js provides CSP, `nosniff`, deny framing, a restrictive Permissions-Policy,
and HSTS in production. Auth/account/API responses are no-store; auth link pages
use `Referrer-Policy: same-origin` as defense in depth while legitimate
same-origin forms preserve their Origin.
The current Next hydration model requires
the explicitly documented first-party `unsafe-inline` exceptions for scripts and
styles. Do not loosen CSP for third-party widgets without a reviewed nonce/hash
design.

Nginx access logs only `$uri`, not query strings. More importantly, raw action
tokens remain in browser-only fragments, so neither access nor upstream error
request lines can contain them. Next development incoming-request logging is
also disabled as defense in depth.

## Configuration review

The following are non-secret configuration and may be committed as examples only:

- `APP_NAME=ITQANAK`
- `DEFAULT_LOCALE=ar`
- public/admin URLs
- WhatsApp mode, phone-number ID, template name, and template language

Database URLs, Redis URLs containing passwords, authentication-email payload keys,
SMTP passwords, session secrets, Meta app secrets, Verify Tokens, System User
Tokens, storage credentials, and TLS private keys are secrets. Store production
values in protected external secret files, not `.env`, GitHub variables printed
in CI, or Compose YAML.

## Vulnerability response

Triage a report by containing exposure, preserving relevant redacted evidence, rotating affected credentials, checking access and audit records, patching with tests, then documenting the incident. If a secret reaches Git history, assume compromise: revoke it before any history-rewrite discussion.
