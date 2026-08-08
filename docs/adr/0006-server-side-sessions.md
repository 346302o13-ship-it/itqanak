# ADR 0006: Server-side opaque sessions

## Decision

Browser authentication uses opaque `selector.validator` tokens in an `HttpOnly`
cookie. PostgreSQL stores the selector and a SHA-256 hash of the validator, never
the browser token itself. Session authority is reconstructed from the database on
every protected request.

## Consequences

Sessions can be revoked individually or globally, have absolute and idle expiry,
and rotate after sensitive changes. JWTs in `localStorage` are intentionally not
used because they increase XSS exposure and make immediate revocation harder.
