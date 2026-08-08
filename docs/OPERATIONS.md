# Operations

## Development

```bash
pnpm install --frozen-lockfile
pnpm build
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/live
curl --fail http://127.0.0.1:8080/api/health/ready
```

`migrate` is expected to exit successfully after applying or verifying current migrations; long-running services should report healthy. ClamAV definitions can take time to initialize on a first run.

Authentication mail remains disabled unless explicitly configured. For an isolated
local smoke exercise use the Mailpit procedure in [`AUTH_EMAIL.md`](./AUTH_EMAIL.md);
it exposes only a loopback inbox and must use disposable test addresses. Do not
send real user email from development.

To diagnose without exposing a connection string or secret, inspect redacted service logs and health responses:

```bash
docker compose logs --tail=200 web worker migrate
docker compose exec -T postgres psql -U itqanak -d itqanak -c 'SELECT filename, applied_at FROM schema_migrations ORDER BY id'
```

Do not use `docker compose down -v` unless deleting all local development data is intentional and separately approved.

## Release sequence

1. Require a clean checked-out commit and a verified off-server backup.
2. Run `pnpm install --frozen-lockfile`, lint, typecheck, tests, build, and Docker image builds.
3. Set protected secret-file paths and non-secret production URL configuration outside the repository.
4. If email delivery is enabled, provide an auth-email AES-GCM key secret and,
   for SMTP, the SMTP password secret. Render Compose with
   `docker compose -f compose.production.yaml config`.
5. Start production Compose. Its migration job runs before Web and Worker start.
6. Confirm `/api/health/live` and `/api/health/ready` through loopback gateway, then Cloudflare Access/DNS as an explicitly approved step.
7. Monitor structured logs, container health, backup result, and schema status.

## Schema deployment rule

Never deploy application code that expects a column/table before its migration is applied. The deployment's migration job is the gate; readiness also fails on pending or altered migrations. Remediation is a new forward-only migration, not editing an applied file or writing a down migration automatically.

## Routine checks

- Daily: backup job and out-of-server upload result.
- Weekly: restore a backup to a newly prepared `itqanak_restore_*` database.
- Monthly: check dependency updates, image updates, resource usage, log redaction, and secret rotation state.
- Per release: `pnpm db:verify`, auth unit/integration checks, container health,
  gateway health, and recovery documentation review.
