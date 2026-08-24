# Backup and restore

## Backup

`scripts/backup-postgres.sh` uses `pg_dump -Fc`, validates the resulting archive
with `pg_restore --list`, sets mode `0600`, writes a SHA-256 metadata file, and
performs constrained local retention. It accepts `DATABASE_URL_FILE` (preferred)
or `DATABASE_URL`; both values must be PostgreSQL connection URIs using the
`postgresql://` or `postgres://` scheme. It never prints the URL.

Before starting any PostgreSQL client, the scripts remove the supplied URL and
all ambient libpq connection variables from the child environment. They parse
the URI in-process and create a one-use `pg_service.conf` inside a mode `0700`
temporary directory; the file itself is mode `0600`. `pg_dump`, `psql`, and
`pg_restore` receive only a non-secret `service=<fixed-name>` selector. The
service file is overwritten and removed on completion or failure, and the
backup path removes it immediately after `pg_dump` disconnects. Consequently a
database password is not exposed through a client process's command line or
environment. The direct URL variables remain supported for compatibility, but
the `*_URL_FILE` variants minimize exposure in the invoking process too.
Percent-encoded reserved characters are supported. Decoded parameter values
that begin or end with whitespace, contain line breaks, or exceed the service
format's safe line bound are rejected instead of being serialized ambiguously.

```bash
export DATABASE_URL_FILE=/run/secrets/database_url
export BACKUP_DIR=/srv/itqanak-backups
export BACKUP_RETENTION_DAYS=30
export BACKUP_S3_URI=s3://approved-itqanak-backup-bucket/postgres
scripts/backup-postgres.sh
```

`BACKUP_S3_URI` is optional and uses the configured AWS-compatible CLI credentials
from the environment/instance role; no credentials are embedded in the script.
The backup is not considered durable until upload to a distinct account/provider
has succeeded.

## Production Compose operation

The production backup container runs as UID/GID `10001` and does not receive a
writeable application filesystem. Before enabling its systemd timer, create a
dedicated host directory owned by that service account and point
`ITQANAK_BACKUP_DIR` at it:

```bash
install -d -m 0700 -o 10001 -g 10001 /srv/itqanak-backups
export ITQANAK_BACKUP_DIR=/srv/itqanak-backups
```

The hardened verification container reuses only the protected operator
credentials from `DATABASE_URL_FILE`, then overrides the database name to the
fixed `itqanak_restore_verification` target. It never accepts the live database
name as a verification target. The daily service runs the backup entrypoint only:

```bash
docker compose -f compose.production.yaml --profile operations run --rm backup
```

## Restore verification

Prepare a **new empty** temporary database named `itqanak_restore_<date>`. The
scripts deliberately will not drop or overwrite a database, and only accept
targets matching that name pattern.

```bash
# Create the empty temporary database with an approved DBA process.
export DATABASE_URL_FILE=/run/secrets/database_url
export VERIFY_DATABASE_NAME=itqanak_restore_20260813
scripts/verify-backup.sh /srv/itqanak-backups/itqanak-postgres-YYYYMMDDTHHMMSSZ.dump
```

When using the hardened Compose image, override only its entrypoint to perform
the same verification against the separate restore target:

```bash
docker compose -f compose.production.yaml --profile operations run --rm \
  --entrypoint /usr/local/bin/verify-backup.sh backup \
  /backups/itqanak-postgres-YYYYMMDDTHHMMSSZ.dump
```

Verification checks the archive, optional metadata checksum, restore command,
`schema_migrations`, and `platform_metadata`. Historical pre-Phase-3 backups are
reported as `phase3_schema=not_applied`. If any Phase 3 migration is present, the
complete `003`–`005` set is required together with these tables:

- `service_categories`
- `services`
- `service_requests`
- `service_request_events`
- `service_request_attachments`

For a Phase 3 backup, verification also requires the seeded/operational catalog
to contain at least one category and one service. It reports row counts for the
catalog, requests, events, and attachments without printing row content. Zero
requests, events, or attachments is a valid result; a newly launched deployment
or a backup taken before its first request must not fail verification for being
empty. The database dump still contains attachment metadata only—private object
bytes require their separate provider backup and restore verification.

Keep the temporary DB for review or remove it only through the separately
approved database-retention process.

## Connection-secret regression test

The shell regression test checks URI parsing, percent decoding, temporary file
modes, rejection of line-breaking values, and cleanup:

```bash
scripts/tests/libpq-service.test.sh
```

Integration mode additionally holds a real `psql` connection open with
`pg_sleep` and inspects `/proc/<pid>/cmdline` and `/proc/<pid>/environ` while the
client is alive. Use only a dedicated test database URL and a unique marker
contained in its password:

```bash
export LIBPQ_TEST_DATABASE_URL_FILE=/run/secrets/libpq_test_database_url
export LIBPQ_TEST_SECRET_MARKER='a-unique-password-substring'
scripts/tests/libpq-service.test.sh --integration
```

## Restore after a disaster

1. Provision a new host and install Docker, Compose, and required monitoring.
2. Clone a known reviewed Git commit; do not rebuild from an unverified host copy.
3. Retrieve the database backup and its metadata from off-server object storage; verify SHA-256.
4. Provision PostgreSQL/Redis and protected Docker secrets on the new host.
5. Restore into a prepared database, validate `schema_migrations`, then point the production secret to that database only after review.
6. Restore private object storage from its independently versioned/replicated backup; never assume a database backup contains files.
7. Start migration, Web, Worker, and Gateway; validate live/readiness through loopback.
8. Update Cloudflare/DNS only after application validation and approved cutover.
9. Rotate database, Redis, session, storage, Meta, and other secrets after recovery; invalidate old sessions as applicable.

## Scheduling

`infra/systemd/itqanak-backup.timer` provides the daily local trigger. Keep weekly
and monthly retained copies outside the server according to the organization’s
retention policy. Exercise the restore procedure at least weekly with a freshly
created `itqanak_restore_*` target and the full host/object-storage/DNS runbook
periodically. The timer backs up only; it never creates, drops, or reuses a
restore database automatically.
