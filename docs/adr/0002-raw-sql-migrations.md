# ADR 0002: Raw SQL forward-only migrations

**Status:** Accepted

## Context

The previous system had no clear migration gate and code read a missing column before its migration ran. Future financial and authorization constraints must be auditable in SQL.

## Decision

Use versioned SQL files and a small `postgres.js` runner with checksum ledger, advisory lock, and per-file transaction. No heavyweight ORM owns the canonical schema and no automatic down migrations are generated.

## Consequences

Database changes are visible and reviewable. A faulty deployment is corrected by a new migration, not history mutation.
