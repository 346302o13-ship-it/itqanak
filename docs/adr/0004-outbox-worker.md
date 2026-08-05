# ADR 0004: Transactional outbox and separate worker

**Status:** Accepted

## Context

Directly sending external notifications from request transactions risks loss and duplicate sends during failure/retry.

## Decision

Write event and aggregate in one transaction; use a separate Worker to claim and deliver outbox work idempotently. Phase 1 creates the schema/interface only and sends no external messages.

## Consequences

Email/WhatsApp can gain backoff, dead-letter review, webhook correlation, and provider-specific handling without coupling to Web requests.
