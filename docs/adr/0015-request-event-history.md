# ADR 0015: Append-only request event history

**Status:** Accepted

## Context

A request timeline must remain explainable without reconstructing meaning from mutable rows or storing localized prose in PostgreSQL.

## Decision

Write typed events to `service_request_events` in the same transaction as each business mutation. Rows carry actor identifiers, status changes, request version, timestamps, and minimal non-sensitive metadata. Database protections reject update and delete operations. UI code localizes event types into Arabic. Important integration events are also placed in the existing `outbox_events` table in the same transaction.

## Alternatives

- A mutable audit text column was rejected because it loses history.
- Localized event sentences in the database were rejected because they prevent clean future translation.
- A separate outbox table per feature was rejected as unnecessary duplication.

## Consequences

Timelines and asynchronous work have durable sources. Event metadata must remain minimal and cannot contain descriptions, file contents, storage keys, or original filenames.
