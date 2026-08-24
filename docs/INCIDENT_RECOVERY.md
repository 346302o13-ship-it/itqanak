# Incident and recovery playbook

Preserve redacted evidence and current state before mutation. Never paste cookies, reset
tokens, database/S3 URLs, object keys, file names/content, ClamAV signatures or secret-file
paths into a ticket or chat.

## Migration or schema incident

1. Stop rollout and preserve the deployed image, expected commit and redacted logs.
2. Run `db:status` and `db:verify` through protected operator access.
3. Compare the repository migration set with `schema_migrations`. Do not edit an applied file
   or run ad-hoc SQL.
4. Restore a verified backup when integrity requires it, or create a reviewed next
   forward-only remedial migration.
5. Re-run migration, schema readiness, request integration checks and record prevention.

If a request table exists but attachment/storage state is inconsistent, do not repair it by
changing historical migrations. Use the explicit lifecycle and reconciliation process below.

## ClamAV unavailable

Symptoms include `fileScanner: unavailable`, Web readiness 503, stale Worker heartbeat,
`ATTACHMENT_SCAN_REQUESTED` retries and files remaining `PENDING_SCAN`.

`fileScanner: paused-stopped` with the administrative pause enabled is an intentional state,
not this incident. Files must still remain unavailable until the host reconciler resumes
ClamAV and confirms `healthy`/`RUNNING`.

1. Keep the service not-ready; never switch production to `FILE_SCAN_MODE=disabled` and
   never mark pending/error files clean.
2. Check ClamAV container health/resource pressure and definition initialization through
   redacted service logs. Do not expose its port publicly.
3. Restore the required service/config/network path and confirm PING produces
   `fileScanner: healthy`.
4. Let Worker reclaim leased/retry jobs, or run one bounded `files:scan-pending` batch from a
   correctly configured operator context.
5. Review `SCAN_ERROR` and `DEAD_LETTER` rows after the attempt limit. Recovery requires a
   reviewed requeue procedure; changing DB status by hand is not a routine fix.

Disabled development files remain `SCAN_SKIPPED_DEVELOPMENT`; do not promote their storage
or database to production as clean.

## Infected attachment

1. Do not download or copy the object for casual inspection. The worker makes it unavailable,
   records the event and moves it to `DELETE_PENDING` before deletion.
2. Confirm the object reaches `DELETED`; if deletion failed, use the referenced-object
   reconciliation procedure after storage access is restored.
3. Preserve only redacted metadata/event evidence needed for the incident. Use an approved
   isolated malware-analysis process if retention is legally/security required; the normal
   product flow deletes the object.
4. Review other related uploads and scanner-definition freshness without disclosing the
   threat name to clients or logs not approved for it.

## Storage unavailable or missing object

1. Stop file mutations if failures are broad. Request pages may still read PostgreSQL, so do
   not infer storage health from database readiness alone.
2. Check provider/container health, credentials, bucket policy and network from protected
   access. Rotate a credential only when required; never print it.
3. Run `storage:verify` read-only. It samples at most 200 active references; a reported 403 or
   network failure is not evidence of object absence.
4. For a truly missing `STORED` object, preserve its attachment/request IDs and SHA-256,
   restore the exact private object from the matching object backup/version, then verify
   length/hash and authorization path. Do not invent a replacement or mark a row deleted to
   hide loss.
5. Assess affected students and notification obligations through the approved incident
   process.

## Interrupted upload/delete and reconciliation

The normal Saga is DB `PENDING_UPLOAD` -> object put -> DB `STORED`, while deletion is DB
`DELETE_PENDING` -> object delete -> DB `DELETED`. PostgreSQL and S3 are not ACID together.

1. Wait at least the configured safety age so foreground work is not raced: five minutes for
   `UPLOAD_FAILED`/`DELETE_PENDING`, and one hour for an interrupted `PENDING_UPLOAD`.
2. Preview only:

   ```bash
   pnpm storage:cleanup-orphans
   ```

3. Confirm storage is reachable and review counts for stale `PENDING_UPLOAD`,
   `UPLOAD_FAILED`, `DELETE_PENDING` and referenced objects.
4. Execute a small bounded batch only after review:

   ```bash
   pnpm storage:cleanup-orphans -- --execute --limit=5
   ```

5. Repeat dry-run and inspect redacted structured outcomes. Missing local objects are
   idempotent only on `ENOENT`; permission/network failures remain pending.

The command handles exact keys already referenced by DB rows. It does not list a bucket or
prove there are no completely unreferenced objects. Investigating such objects requires a
separate provider inventory, retention window, backup check and reviewed dry-run plan; never
run a bucket-wide delete as incident cleanup.

## Worker/outbox backlog

1. Confirm PostgreSQL, Redis, ClamAV (when required) and Worker heartbeat.
2. Inspect counts/status/age for scan jobs and dead letters using read-only queries; do not
   rewrite attempt counts or leases.
3. Restore the failing dependency and allow `PROCESSING` leases to expire/reclaim. Claims use
   `SKIP LOCKED` and attempt fencing; starting another healthy Worker is safe only within
   configured resource limits.
4. Run a bounded manual scan batch if needed. Repeated terminal errors need root-cause repair
   and an explicit requeue design, not direct status mutation.
5. Check request event and outbox idempotency keys before replaying any downstream product
   event.

## Suspected IDOR or request-history tampering

1. Contain the affected route/session and preserve request IDs, request IDs from logs and
   security-audit records without student content.
2. Verify every query joins/predicates through the authenticated owner and required
   permission; test two distinct disposable students.
3. Check append-only request events, request versions and related audit/outbox rows. A DB
   superuser incident requires broader database containment even though application
   mutations are trigger-protected.
4. Revoke affected sessions/roles, patch with an ownership/concurrency regression test and
   assess disclosure obligations.

## Suspected secret exposure

1. Revoke/rotate the secret immediately; assume compromise even if access is uncertain.
2. Replace protected external secret files and restart affected services safely.
3. Inspect redacted access/audit records and provider-side database/Redis/S3/SMTP activity.
4. Remove the cause, add a regression check and assess user/regulatory notification.

## Account/session compromise

1. Preserve redacted request and audit evidence; never copy credentials or raw tokens.
2. Revoke affected sessions. Password change/reset invalidates active sessions.
3. Check and revoke unexpected ADMIN roles with the protected CLI; role changes invalidate
   sessions.
4. Rotate infrastructure/auth-email secrets if exposure crossed that boundary and document
   cause and remediation.

## Host loss and full recovery

Follow [`BACKUP_RESTORE.md`](./BACKUP_RESTORE.md): rebuild from the reviewed Git revision,
retrieve off-server database and private object-storage backups, restore/test them in
isolation, apply only forward migrations, start behind loopback and validate schema,
readiness, Worker heartbeat and scanner health.

Then run `storage:verify`, sample authorized downloads and reconcile only old explicit
failure states. Perform DNS/Cloudflare cutover as a separately approved step and rotate
credentials. A database dump without objects—or an object backup without matching metadata—
is not complete recovery.
