# Session management

Each session is an opaque `selector.validator` cookie. PostgreSQL stores a UUID,
the selector, SHA-256 validator hash, timestamps, optional hashed IP/short user
agent summary, and revocation reason. The raw value appears only in the HTTPS
response that creates or rotates it. Session lookup parses the selector, compares
the validator hash in constant time, verifies account status and expiry, then
periodically touches `last_seen_at`/idle expiry.

| Account type | Absolute expiry | Idle expiry |
| ------------ | --------------: | ----------: |
| Student      |         30 days |      7 days |
| Admin        |        12 hours |     2 hours |

Both values are configuration defaults in `.env.example`; deployment may tighten
them. The active role set determines which expiry is used. A session becomes
invalid after expiry, idle expiry, explicit logout, individual revocation,
revoke-all, password reset/change, or role change.

The authenticated `/ar/account/sessions` page lists only the current user's
session metadata and can revoke one session or all sessions. Revoking the current
session clears the browser cookie. No page exposes a raw session, validator, IP
address, or full user agent.

## Incident response

For a suspected account compromise, use the account session page when the user
can still authenticate, or revoke roles/sessions through protected operator
access. Password reset/change invalidates all sessions by design. For broad
incidents, rotate affected infrastructure secrets, invalidate sessions through a
reviewed administrative action, preserve redacted audit records, and follow
[`INCIDENT_RECOVERY.md`](./INCIDENT_RECOVERY.md). Do not attempt to recover a
session from a cookie, a database backup, or an application log.
