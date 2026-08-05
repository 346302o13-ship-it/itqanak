# ADR 0001: pnpm/Turborepo monorepo

**Status:** Accepted

## Context

Web, Worker, configuration, domain policy, database access, storage, and UI must share types without duplicating security/business rules.

## Decision

Use pnpm workspaces and Turborepo, with `apps/*` and `packages/*`, strict TypeScript, pinned tool versions, and workspace package dependencies.

## Consequences

Changes to a shared contract are explicit and build in dependency order. Docker builds copy the workspace and run filtered Turbo builds; package boundaries remain reviewable.
