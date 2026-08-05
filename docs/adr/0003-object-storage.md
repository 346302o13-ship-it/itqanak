# ADR 0003: Private object storage abstraction

**Status:** Accepted

## Context

Student files must survive web-container replacement, remain non-public, and be portable between local development and production.

## Decision

Use opaque keys through a Storage port. Local filesystem/MinIO are development only; production uses S3-compatible storage. Original filenames are metadata and signed URLs follow application authorization.

## Consequences

No uploaded file is stored in `public` or inside the Web image. Scan status and access policy can evolve independently from storage vendor.
