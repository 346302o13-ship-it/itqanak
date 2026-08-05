# Database migrations

## Commands

```bash
pnpm db:migrate
pnpm db:status
pnpm db:verify
```

`db:migrate` creates the ledger if required and applies pending files once.
`db:status` is read-only and reports whether files are pending. `db:verify` fails
if the database is not fully compatible with repository migrations.

## Rules

1. Create the next ordered file as `migrations/NNN_lowercase_name.sql`.
2. Use forward-only corrective migrations. Never edit, rename, delete, or add a down migration for a file that has been applied anywhere shared.
3. Keep a migration small, deterministic, reviewable, and transactional when PostgreSQL permits it. Document any operation that cannot be transactional.
4. Do not make application code depend on a migration until the migration is deployed and readiness confirms it.
5. Add a migration integration test when runner behavior or a non-trivial data transformation changes.

## Runner guarantees

The runner takes a PostgreSQL advisory lock, computes SHA-256 over every SQL file,
checks the ledger before applying, wraps each file and ledger insert in a single
transaction, records execution milliseconds, and rechecks compatibility at the
end. A failed SQL statement rolls back that file and does not mark it applied.

## Incident response

If `db:verify` reports a mismatch, stop deployment. Do not modify historical SQL
to make the checksum match. Restore the correct repository artifact or introduce
a reviewed remedial migration after confirming the target schema.
