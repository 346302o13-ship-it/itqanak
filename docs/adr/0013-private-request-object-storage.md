# ADR 0013: Private request object storage and compensation

**Status:** Accepted

## Context

Student attachments must remain private and survive application-container replacement. PostgreSQL transactions cannot include filesystem or S3 operations.

## Decision

Use the `@itqanak/storage` port with opaque, server-generated keys under a request/attachment namespace. The original name is metadata only and never forms a path. Local private storage is development-only; production uses a private S3-compatible bucket. Uploads reserve a database row, store the object, then finalize the row. Failures retain an explicit storage state and trigger best-effort compensation; orphan inspection is dry-run by default.

## Alternatives

- Database byte storage was rejected because it couples large objects to transactional data and backups.
- Public buckets or files under `public/` were rejected because authorization could be bypassed.
- Pretending PostgreSQL and S3 are one ACID transaction was rejected as incorrect.

## Consequences

Downloads always pass application authorization and scan policy. Operators can distinguish upload, deletion, and scan failures and safely reconcile orphaned objects.
