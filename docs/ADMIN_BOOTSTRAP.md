# Administrator bootstrap

There is no public administrator registration route. Create the first account
only from a protected operator terminal after production migration and readiness
are healthy. The CLI accepts no password command-line option and masks interactive
password input.

```bash
# Development: run inside the migration image/network, not with a host database URL.
docker compose run --rm --no-deps migrate pnpm auth:create-admin

# Production: run the reviewed auth CLI image with the same protected database
# secret mount used by the application, through the approved deployment process.
```

The command asks for display name, email, password, confirmation, and a literal
confirmation before it creates an active `ADMIN` record. Store neither transcript
nor password. Verify with a normal browser login and confirm `/ar/admin` returns
the dashboard only for that account.

To change an existing account, run `pnpm auth:grant-role` or
`pnpm auth:revoke-role` through the same protected environment. Both require
confirmation and revoke active sessions. `SYSTEM` is not assignable from this CLI.
Cloudflare Access is a future outer control for the admin hostname; it supplements
but never replaces the in-application `ADMIN` permission check.
