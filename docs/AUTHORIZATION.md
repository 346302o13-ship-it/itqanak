# Authorization

Authorization is enforced inside the service layer, not by navigation or
middleware alone. Middleware can redirect a browser with no session for a better
user experience, but each account action constructs an authenticated principal
from the opaque session and calls a permission check before accessing data.

## Roles and permissions

`VISITOR` is an unauthenticated conceptual role and is deliberately not a row in
the database. Database roles are `STUDENT`, `ADMIN`, and `SYSTEM`.

| Role      | Current permissions                                                       |
| --------- | ------------------------------------------------------------------------- |
| `STUDENT` | Read/update own profile; list/revoke own sessions.                        |
| `ADMIN`   | All student permissions plus dashboard, user read/manage, and audit read. |
| `SYSTEM`  | Non-browser internal administrative permissions only.                     |

Permissions are seeded in migration `002_identity_authentication.sql` through
`roles`, `permissions`, `role_permissions`, and `user_roles`. A public
registration can create only `STUDENT`; it cannot choose a role. Administrative
routes check `admin.dashboard.view` in application code and return 403 unless the
authenticated session has that permission.

## Operational changes

Role mutation is an operator command, not a public endpoint:

```bash
pnpm auth:grant-role
pnpm auth:revoke-role
```

The commands ask for the account email, an allowed role, and an explicit
confirmation. They never take a password as a command-line argument. Changing a
role revokes active sessions so new permissions only take effect after a new
login. See [`ADMIN_BOOTSTRAP.md`](./ADMIN_BOOTSTRAP.md).

Future request, file, chat, and export features must add a named permission and
perform ownership/tenant checks at each server boundary. Being able to guess an
ID, load a client route, or hold an old cookie must never grant authorization.
