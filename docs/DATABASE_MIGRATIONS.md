# Database migrations

## Commands

```bash
pnpm db:migrate
pnpm db:status
pnpm db:verify
```

`db:migrate` creates the ledger if required and applies pending files once. `db:status` is
read-only. `db:verify` fails if a migration is pending, missing, changed, failed or unknown
to the checked repository set. In the default Docker network run them through the `migrate`
service; the migrator does not need S3 or ClamAV secrets.

## Rules

1. Add the next file as `migrations/NNN_lowercase_name.sql`.
2. Use forward-only corrective migrations. Never edit, rename or delete a file applied to a
   shared environment, and never manufacture a down migration to disguise drift.
3. Keep a migration deterministic, reviewable and transactional when PostgreSQL permits.
4. Do not deploy code that requires a schema change before the migration gate succeeds.
5. Add integration coverage for non-trivial constraints, trigger behavior or data changes.
6. Object-storage repairs are not SQL migrations. Use explicit storage states and the
   reconciler; PostgreSQL cannot transact with S3.

## Runner guarantees

The runner sorts migration names, takes a PostgreSQL advisory lock, computes SHA-256 over
each SQL file, checks `schema_migrations`, and wraps each pending file and its ledger insert
in one transaction. It records execution duration and rechecks compatibility. A failed SQL
statement rolls back that file and does not mark it applied.

## Current schema history

### `001_platform_foundation.sql`

Creates `pgcrypto`, `platform_metadata`, the reusable `outbox_events` ledger and
`worker_heartbeats`.

### `002_identity_authentication.sql`

Creates users, credentials, roles/permissions, opaque sessions, verification/reset tokens,
legal acceptances, security audit events and encrypted authentication-email outbox records.

### `003_service_catalog.sql`

Creates `service_categories` and `services` with unique normalized slugs, Arabic content,
NUMERIC pricing metadata, activation, file-policy limits and sort indexes. It also inserts
catalog permissions idempotently. Development sample rows are not part of the migration;
the explicit seed CLI owns them.

### `004_service_requests.sql`

Creates a non-cycling request-number sequence and formatter, `service_requests`, student/
status/service indexes and `service_request_events`. Important constraints include:

- human numbers `ITQ-YYYY-{six-or-more digits}` and per-student unique `submission_key`;
- fixed state/urgency/language/academic-level allowlists, paired budget currency and policy
  acceptance/version timestamps;
- positive optimistic `version` and timestamp/state consistency checks;
- append-only history triggers rejecting UPDATE, DELETE and statement-level TRUNCATE;
- typed actor/status/version metadata and minimal JSON object metadata.

The migration links `security_audit_events` to optional resource type/UUID, adds a partial
resource index and inserts request permissions idempotently.

### `005_request_attachments.sql`

Creates `service_request_attachments` metadata; object bytes remain outside PostgreSQL. It
separates:

- storage: `PENDING_UPLOAD`, `STORED`, `DELETE_PENDING`, `DELETED`, `UPLOAD_FAILED`;
- scanning: `NOT_REQUIRED`, `PENDING_SCAN`, `CLEAN`, `INFECTED`, `SCAN_ERROR`,
  `SCAN_SKIPPED_DEVELOPMENT`, `REJECTED`.

Constraints bind S3 rows to a bucket, keys to the owning request/attachment namespace,
stored rows to hash/detected MIME, terminal scan rows to completion timestamps, and
soft-deleted rows to deletion storage states. Partial indexes support request listing,
scan delivery/retries and unique non-null object identity. The migration inserts own-
attachment permissions idempotently.

## Deployment and incident rule

The production migrator is the schema gate; Web startup/readiness verifies the same ledger.
If `db:verify` reports drift, stop deployment. Do not edit historical SQL or execute ad-hoc
repair SQL. Restore the correct artifact or add a reviewed next forward-only migration after
confirming data state and a verified backup.
