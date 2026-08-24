# Administrator bootstrap

There is no public administrator registration route. Create the first account
only from a protected operator terminal after production migration and readiness
are healthy. The CLI accepts no password command-line option and masks interactive
password input.

The production sign-in pages are deliberately separate from the student portal:

- Arabic: `https://admin.itqanqhelpstudent.online/ar/auth/login?next=%2Far%2Fadmin`
- English: `https://admin.itqanqhelpstudent.online/en/auth/login?next=%2Fen%2Fadmin`

The public site footer also links to the appropriate administrator sign-in page.
An account reaches the center only when it has the database-backed `ADMIN` role;
knowing the URL never grants administrative access.

```bash
# Run from a protected interactive terminal after rebuilding the reviewed
# migration image. Calling Node directly prevents Corepack or a package registry
# from being consulted on the backend-only production network.
docker compose --env-file .env.production -f compose.production.yaml run --rm --no-deps \
  migrate node packages/auth/dist/cli.js create-admin
```

The command asks for display name, email, password, confirmation, and a literal
confirmation before it creates an active `ADMIN` record. The email must exactly
match `CLOUDFLARE_ACCESS_ADMIN_EMAIL` after case normalization. Store neither
transcript nor password. Verify with a normal browser login and confirm `/ar/admin`
returns the dashboard only for that account.

The database and authentication service enforce a single `ADMIN` role, including
concurrent creation attempts. Do not create a temporary second administrator.
Cloudflare Access supplements, but never replaces, the in-application `ADMIN`
permission and session checks.
