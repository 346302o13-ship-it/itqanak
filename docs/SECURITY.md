# Security baseline

## Boundaries in Phase 1

- Gateway is the sole host-facing container and binds `127.0.0.1:8080`.
- PostgreSQL, Redis, ClamAV, and MinIO do not publish host ports.
- Production application containers run as non-root, drop Linux capabilities, enable `no-new-privileges`, use read-only roots where viable, and receive writable tmpfs only where required.
- Production secrets use Docker secret files. Config accepts only safe paths below `/run/secrets` and never prints a secret value or path.
- Structured logs redact passwords, tokens, authorization headers, cookies, secrets, email, phone, and sensitive file-path/name fields. Do not log full request or webhook bodies.
- Phase 1 has no authentication and therefore no protected business data. `/ar/admin` is explicitly a placeholder, not an administrative surface.

## Required controls for later phases

1. Enforce server-managed `HttpOnly`, `Secure`, `SameSite` session cookies; never use `localStorage` for sessions/tokens.
2. Require authorization at every request, conversation, attachment, export, and direct-object link boundary.
3. Put the administrative domain behind Cloudflare Access and also verify `ADMIN` role in the application.
4. Use CSRF protections for state-changing browser requests; rate-limit login, recovery, upload, and integration endpoints.
5. Keep files private, generate opaque object keys, validate size and type, sniff content, scan with ClamAV, and authorize before issuing a short-lived download URL.
6. Treat payment and WhatsApp callbacks as untrusted input. Verify authentic signatures, retain idempotency keys, redact payloads, and model ambiguous network results explicitly.
7. Use audit logs for sensitive actions; do not permit UI mutation of the audit ledger.
8. Rotate secrets after personnel changes, suspected disclosure, or disaster recovery. Do not reuse a development secret in production.

## Configuration review

The following are non-secret configuration and may be committed as examples only:

- `APP_NAME=ITQANAK`
- `DEFAULT_LOCALE=ar`
- public/admin URLs
- WhatsApp mode, phone-number ID, template name, and template language

Database URLs, Redis URLs containing passwords, session secrets, Meta app secrets, Verify Tokens, System User Tokens, storage credentials, and TLS private keys are secrets. Store production values in protected external secret files, not `.env`, GitHub variables printed in CI, or Compose YAML.

## Vulnerability response

Triage a report by containing exposure, preserving relevant redacted evidence, rotating affected credentials, checking access and audit records, patching with tests, then documenting the incident. If a secret reaches Git history, assume compromise: revoke it before any history-rewrite discussion.
