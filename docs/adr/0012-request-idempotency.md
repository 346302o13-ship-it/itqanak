# ADR 0012: Per-student request-creation idempotency

**Status:** Accepted

## Context

Browsers can repeat a request-creation POST after a double click, refresh, retry, or ambiguous network timeout. A check followed by an insert is subject to races.

## Decision

The create form carries an opaque UUID `submission_key`. PostgreSQL enforces uniqueness on `(student_user_id, submission_key)`. The server also stores a canonical payload fingerprint: a retry with the same key and fingerprint returns the original request, while reuse for different input returns a conflict. A sequence generates the human request number; gaps are expected and numbers are never reused.

## Alternatives

- `COUNT(*)` numbering and client-generated request numbers were rejected as race-prone.
- A global idempotency key was rejected because independent students may legitimately receive the same random value.

## Consequences

Concurrent identical submissions create one request, one history event, and one outbox event. Sequence gaps are an intentional tradeoff for concurrency safety.
