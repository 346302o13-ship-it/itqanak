# ADR 0007: Permission-based RBAC

## Decision

Roles are seeded in SQL and map to explicit permissions through
`role_permissions`. Application guards ask for a role or permission through
`packages/auth`; page-local role string comparisons are prohibited.

## Consequences

Public registration can only assign `STUDENT`. Administrative routes require an
active session with `ADMIN` and `admin.dashboard.view`; unknown permissions deny
access by default.
