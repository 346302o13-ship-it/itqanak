# Authentication email outbox

Authentication messages are durable database work, not an in-request SMTP call.
Registration, resend, reset, and password-change transactions write their user
state, audit record, token state, and an `auth_email_outbox` row together. The
Worker claims rows using `FOR UPDATE SKIP LOCKED`, retries transient failure with
bounded exponential backoff and jitter, recovers stale claims, and ends exhausted
work in `DEAD` for operator review. When a verification or reset token is
superseded or consumed, queued copies are marked `DEAD`, their ciphertext is
erased, and the worker revalidates action-token state immediately before send.
Each outbox row keeps one stable idempotency key, reused as the SMTP `Message-ID`
on retries. Delivery is therefore at-least-once across an SMTP/DB crash boundary;
the stable identifier enables provider-side deduplication without falsely
claiming distributed exactly-once delivery.

Production SMTP always requires TLS (TLS 1.2 or newer), including STARTTLS when
`SMTP_SECURE=false`; delivery fails rather than sending credentials or action
links over plaintext. The only plaintext exception is the loopback-only Mailpit
development profile.

The display name and raw link token are encrypted with AES-256-GCM before
insertion, using `AUTH_EMAIL_PAYLOAD_KEY`. The row also retains recipient email
as delivery addressing metadata, like the user record; it never retains a raw
token. On successful delivery, the Worker clears the ciphertext; logs contain
the outbox identifier and result, not recipient address, message body, or token.

## Modes

| `EMAIL_DELIVERY_MODE` | Intended use                   | Result                                                            |
| --------------------- | ------------------------------ | ----------------------------------------------------------------- |
| `disabled`            | default/local safe mode        | No sender is created; auth flows requiring email are unavailable. |
| `test`                | Node test environment only     | In-memory sender; processed rows become `SKIPPED_TEST`.           |
| `smtp`                | approved SMTP or local Mailpit | Worker sends Arabic messages and rows become `SENT`.              |

`smtp` and `test` require a cryptographically random, base64-encoded 32-byte
`AUTH_EMAIL_PAYLOAD_KEY`. `smtp` additionally requires host, sender address, and
`SMTP_PASSWORD`. The config rejects `test` outside `NODE_ENV=test`, missing
encryption material, and incomplete SMTP configuration. SMTP URLs are composed
only from the configured trusted `PUBLIC_APP_URL`.

## Local Mailpit exercise

Mailpit is intentionally an opt-in development profile. It exposes only its UI
at `127.0.0.1:8025`; SMTP is internal to Docker and no real recipient is needed.
Keep the generated values in the current shell, not in `.env.example` or Git:

```bash
export AUTH_EMAIL_PAYLOAD_KEY="$(openssl rand -base64 32)"
export EMAIL_DELIVERY_MODE=smtp
export SMTP_HOST=mailpit
export SMTP_PORT=1025
export SMTP_SECURE=false
export SMTP_FROM_ADDRESS=dev@itqanak.test
export SMTP_PASSWORD=mailpit-local-only
docker compose --profile mail up -d --wait --force-recreate mailpit web worker gateway
```

Open the loopback inbox, complete a registration with a disposable
`@example.test` address, and use the received verification link. Do not paste the
link/token into a terminal or ticket. After the check, return to
`EMAIL_DELIVERY_MODE=disabled` and recreate the web/worker services.

Mailpit remains a manual exercise for legacy email verification and password recovery.
The current `pnpm test:auth-e2e` suite instead exercises phone-first registration and
audited manual WhatsApp confirmation through the administrator UI. It deliberately
refuses to run unless a local gateway and PostgreSQL container belong to an explicitly
named disposable `e2e`/`test` Compose project; see the CI job for the complete environment.
Email token behavior remains covered by service-level unit and isolated integration tests,
where one-time links are never retained in Playwright artifacts.

Public phone-first student registration requires both an email address and a supported mobile
number. The email is normalized and stored as a unique contact/login identity, but it is not an
activation factor and no verification email is queued. The account remains
`PENDING_VERIFICATION` until an administrator confirms the registered WhatsApp number. The
email-verification flow described above is retained only for legacy email-only identities.

## Production secrets

Use Docker secret files, not Compose environment values, for
`auth_email_payload_key` and `smtp_password`. Set
`ITQANAK_AUTH_EMAIL_PAYLOAD_KEY_SECRET_FILE` whenever mail is enabled; set
`ITQANAK_SMTP_PASSWORD_SECRET_FILE` only for SMTP. Conventional files are mounted
at `/run/secrets/auth_email_payload_key` and `/run/secrets/smtp_password` and are
read by the configuration resolver without logging their values or paths.
