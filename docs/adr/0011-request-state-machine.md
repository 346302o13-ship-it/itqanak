# ADR 0011: Central service-request state machine

**Status:** Accepted

## Context

Service requests will be changed by students, administrators, and workers. If a route or UI embeds its own transition rules, the same request can acquire an invalid state as features are added.

## Decision

Keep the canonical request states and transition matrix in `@itqanak/core`. Every mutation first enforces authentication, an explicit permission, and ownership where applicable, then calls the domain state machine. HTTP handlers and React components never update `service_requests.status` directly. Phase 3 exposes only student draft submission and cancellation; later administrative states are defined but have no incomplete administrative route.

## Alternatives

- Database-only transition triggers were rejected because they cannot express the full actor and permission context cleanly.
- Per-route checks were rejected because they duplicate policy and drift.

## Consequences

All callers share one transition policy and forbidden transitions fail closed. Database constraints still restrict the set of stored states, while authorization remains separate from workflow policy.
