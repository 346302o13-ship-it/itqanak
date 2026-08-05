# Backup and restore

## Backup

`scripts/backup-postgres.sh` uses `pg_dump -Fc`, validates the resulting archive
with `pg_restore --list`, sets mode `0600`, writes a SHA-256 metadata file, and
performs constrained local retention. It accepts `DATABASE_URL_FILE` (preferred)
or `DATABASE_URL`; it never prints the URL.

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

`compose.production.yaml` requires a separate
`ITQANAK_VERIFY_DATABASE_URL_SECRET_FILE`. Its URL must name a newly prepared
`itqanak_restore_*` database; it must not point to the live database. The daily
service runs the backup entrypoint only:

```bash
docker compose -f compose.production.yaml --profile operations run --rm backup
```

## Restore verification

Prepare a **new empty** temporary database named `itqanak_restore_<date>` with a
separate protected URL. The scripts deliberately will not drop or overwrite a
database, and only accept targets matching that name pattern.

```bash
# Create the empty temporary database with an approved DBA process.
export VERIFY_DATABASE_URL_FILE=/run/secrets/verify_database_url
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
`schema_migrations`, and `platform_metadata`. Keep the temporary DB for review
or remove it only through the separately approved database-retention process.

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
