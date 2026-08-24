# ADR 0016: Optimistic concurrency for request mutations

**Status:** Accepted

## Context

Students, future administrators, and workers can act on the same request concurrently. Last-write-wins updates can silently overwrite data or apply two conflicting transitions.

## Decision

Every request has an integer `version`. Mutation commands carry the version observed by the caller, lock the owned request in a consistent order, and update only when the expected version still matches. Successful changes increment once and record the resulting version in history and outbox idempotency keys. A stale command receives `409 VERSION_CONFLICT`.

## Alternatives

- Blind updates were rejected because they lose concurrent changes.
- Long-lived pessimistic locks across browser interactions were rejected because they are impractical and fragile.

## Consequences

Concurrent submit, cancel, edit, and attachment reservation operations serialize safely without holding database locks while the user edits a form. Clients must refresh after a conflict.
