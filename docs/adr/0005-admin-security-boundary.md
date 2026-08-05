# ADR 0005: Defence-in-depth for administration

**Status:** Accepted

## Context

Administrative access exposes sensitive student and financial data.

## Decision

Use a future dedicated admin domain behind Cloudflare Access and enforce application-level `ADMIN` authorization independently. Direct attachment URLs and UI route names never substitute for authorization.

## Consequences

An outer-access misconfiguration does not automatically grant admin access. The Phase 1 `/ar/admin` placeholder must remain data-free until authentication and authorization are complete.
