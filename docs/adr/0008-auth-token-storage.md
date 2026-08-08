# ADR 0008: Hashed one-time authentication tokens

## Decision

Verification and password-reset tokens share the selector/validator construction
used by sessions. Only a validator hash is persisted. Tokens are one-time,
short-lived, and revoked together when a newer token is issued.

## Consequences

A database dump cannot directly activate an account, reset a password, or replay
a browser session. Raw tokens exist only in the HTTP request or encrypted email
outbox payload for the short time needed to deliver an email.
