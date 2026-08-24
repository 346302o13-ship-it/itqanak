# Operations

## Development startup

```bash
pnpm install --frozen-lockfile
pnpm build
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/live
curl --fail http://127.0.0.1:8080/api/health/ready
```

Default development uses the shared private local-upload volume and
`FILE_SCAN_MODE=disabled`; ClamAV and MinIO are absent. The scanner check reports
`disabled-development` and readiness remains healthy. To exercise scanning, set
`FILE_SCAN_MODE=clamav` in `.env` and start:

```bash
docker compose --profile antivirus up --build -d
```

To exercise the S3 adapter, provide disposable MinIO credentials and S3 settings from
`.env.example`, then use the `storage` profile. Profiles can be combined:

```bash
docker compose --profile storage --profile antivirus up --build -d
```

ClamAV definitions may take time to initialize. With `FILE_SCAN_MODE=clamav`, readiness must
return 503 until PING succeeds; do not override this with a long startup sleep or mark
unavailable scanning healthy.

Authentication mail remains disabled unless explicitly configured. Use the Mailpit procedure
in [`AUTH_EMAIL.md`](./AUTH_EMAIL.md) with disposable addresses only. Do not use real student
email or production objects in development.

## Database and seed operations

PostgreSQL and Redis expose no host port. Run database operations through the internal
migrator context:

```bash
docker compose run --rm --no-deps migrate pnpm db:migrate
docker compose run --rm --no-deps migrate pnpm db:status
docker compose run --rm --no-deps migrate pnpm db:verify
docker compose run --rm --no-deps migrate pnpm catalog:seed-development
```

The migrator requires database/Redis secrets according to its current contract, but not S3
credentials or ClamAV. The catalog seed is idempotent and refuses production.

## Observability and readiness

```bash
docker compose logs --tail=200 web worker migrate clamav
docker compose exec -T postgres psql -U itqanak -d itqanak \
  -c 'SELECT filename, applied_at FROM schema_migrations ORDER BY id'
```

`/api/health/live` proves only that Web is alive. `/api/health/ready` requires valid config,
PostgreSQL, Redis, the exact checked migration set and the scanner policy. Its file scanner
field is only `disabled-development`, `healthy`, `paused-stopped` or `unavailable`; it must not include
endpoints or exception text. Worker container health depends on a fresh heartbeat written
after its required dependency checks.

Structured logs use request IDs and safe event names. Do not increase verbosity by logging
request descriptions, upload names, object keys, ClamAV signatures, cookies or config.

## Maintenance and scan-queue controls

The admin-only operational controls, maintenance-gate integration hook, audit guarantees and
safe scan-queue pause semantics are documented in
[`OPERATIONAL_CONTROLS.md`](./OPERATIONAL_CONTROLS.md). Web and Worker never manage Docker and
receive no socket, root user or added capability. A separately installed, root-owned host
systemd helper is the only component that starts/stops the ClamAV Compose service.

## Request and storage tools

Run storage-aware commands in a context that can access the configured local volume or S3
credentials. For the default Compose development volume:

```bash
docker compose exec -T worker pnpm requests:cleanup-drafts
docker compose exec -T worker pnpm storage:verify
docker compose exec -T worker pnpm storage:cleanup-orphans
docker compose exec -T worker pnpm storage:cleanup-orphans -- --execute --limit=20
docker compose exec -T worker pnpm files:scan-pending
```

The same `pnpm` commands may run directly in an operator image with equivalent config.

- `requests:cleanup-drafts` reports drafts older than 30 days; it never deletes them.
- `storage:verify` checks up to 200 active `STORED` references. Missing objects are reported;
  permission/network errors fail the command.
- `storage:cleanup-orphans` is dry-run by default and previews referenced
  `UPLOAD_FAILED`/`DELETE_PENDING` rows at least five minutes old plus interrupted
  `PENDING_UPLOAD` rows at least one hour old.
- Only `storage:cleanup-orphans -- --execute` mutates state. It processes 1–20 rows and
  deletes exact DB-referenced keys only. It does not enumerate or purge an S3 bucket.
- `files:scan-pending` processes one bounded, **mutating** manual scan batch. It has no
  preview implementation, so `--dry-run` is rejected before configuration or database access.
  Worker normally handles scan and reconciliation batches continuously.

Review dry-run output and current storage availability before `--execute`. Never interpret a
403/timeout as a missing object, never run bucket-wide deletion, and never invent a key from
an original filename.

## Production configuration

Production Web/Worker require:

- `STORAGE_DRIVER=s3`, S3 region and private bucket, optional HTTPS endpoint and force-path
  style appropriate to the provider;
- S3 access and secret keys through protected Docker secret files;
- `FILE_SCAN_MODE=clamav`, the internal ClamAV service and bounded connection/scan timeouts;
- database/Redis secret files, approved public/admin URLs and a nonempty
  `ACADEMIC_INTEGRITY_VERSION`.

Do not pass S3 credentials on the command line or render them into Compose output. ClamAV has
no published port. S3 bucket policy must be private and deny unintended public ACL/policy
changes.

## Release sequence

1. Require a reviewed commit, clean release artifact and a verified off-server database
   backup; confirm object-storage protection/versioning according to provider policy.
2. Run frozen install, lint, typecheck, unit/integration/E2E tests, build and Docker image
   builds. Run opt-in ClamAV tests in an isolated environment.
3. Set external secret-file paths and non-secret production URL/S3/policy configuration.
4. Render `docker compose -f compose.production.yaml config` and inspect service/profile,
   secret mount and port output without printing secret-file contents.
5. Start production Compose. The migration job must succeed before Web and Worker start. On the
   first release that moves ClamAV behind the `antivirus` profile, run the root-owned host
   reconciler immediately after migration 020 so any already-running legacy ClamAV container is
   stopped; an ordinary profile-less `compose up` does not stop an existing profile service.
6. Confirm live and ready through loopback. Require `fileScanner: healthy` when scanning is
   enabled, or `paused-stopped`/`disabled-by-admin` while the audited default-off state is active, and
   verify Worker heartbeat.
7. Run `db:verify`, a non-destructive `storage:verify`, a student request smoke path with a
   disposable test account, and monitor scan/outbox/dead-letter signals.
8. Connect or change Cloudflare/DNS only as a separately approved production action.

## Routine checks

- Daily: database backup/upload result, object-provider protection status, readiness and
  stale Worker heartbeat/outbox scan failures.
- Weekly: restore a database backup to a new `itqanak_restore_*` database; periodically pair
  it with a protected object restore/sample and run `storage:verify`.
- Monthly: dependency/image updates, resource usage, ClamAV definition freshness, dead-letter
  review, log redaction, S3 policy and secret-rotation state.
- Per release: migration verification, auth/request regression suites, container health,
  scanner readiness, reconciliation dry-run and recovery-document review.

Never use `docker compose down -v` unless deletion of all development database and local
attachment data is explicitly intended. Production recovery uses forward-only migrations
and verified backups, not ad-hoc SQL or manual object deletion.
