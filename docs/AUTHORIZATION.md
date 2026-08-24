# Authorization

Authorization is enforced inside the service layer, not by navigation or
middleware alone. Middleware can redirect a browser with no session for a better
user experience, but each account action constructs an authenticated principal
from the opaque session and calls a permission check before accessing data.

## Roles and permissions

`VISITOR` is an unauthenticated conceptual role and is deliberately not a row in
the database. Database roles are `STUDENT`, `ADMIN`, and `SYSTEM`.

| Role      | Explicit grants                                                                                                                                                                                                                                                                                                                                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `STUDENT` | `account.profile.read`, `account.profile.update`, `account.sessions.read`, `account.sessions.revoke`, `catalog.read`, `requests.create`, `requests.read.own`, `requests.update.own`, `requests.cancel.own`, `requests.attachments.create.own`, `requests.attachments.read.own`, `requests.attachments.delete.own`                               |
| `ADMIN`   | The four account permissions, `admin.dashboard.view`, `admin.users.read`, `admin.users.manage`, `admin.audit.read`, `catalog.read`, `admin.catalog.read`, `admin.catalog.manage`, `admin.requests.read`, `admin.requests.manage`. `ADMIN` is deliberately **not** granted student `requests.*.own` or `requests.attachments.*.own` permissions. |
| `SYSTEM`  | `admin.dashboard.view`, `admin.users.read`, `admin.users.manage`, `admin.audit.read`, `admin.catalog.read`, `admin.catalog.manage`, `admin.requests.read`, `admin.requests.manage`. `SYSTEM` is non-browser and is not granted account, public-catalog, or student-owned-request permissions.                                                   |

Permissions are seeded through migrations `002_identity_authentication.sql` to
`005_request_attachments.sql` using `roles`, `permissions`, `role_permissions`,
and `user_roles`. Grants are explicit: roles do not inherit from one another, and
adding a permission code does not grant it to any role. A public registration can
create only `STUDENT`; it cannot choose a role. Administrative routes check
`admin.dashboard.view` in application code and return 403 unless the authenticated
session has that permission.

Migration `012_managed_content_blocks.sql` adds the independent
`admin.content.read` and `admin.content.manage` capabilities for `ADMIN` and
non-browser `SYSTEM`. The browser content service still requires an actual
`ADMIN` principal with dashboard access; neither capability is inferred from the
role, and read access never implies write access.

Migration `015_finance_dues_and_manual_payments.sql` adds
`finance.read.own` for student-owned financial records and separates
`admin.finance.read`, `admin.finance.manage`, and
`admin.finance.reports.read`. The finance service always combines the student
permission with a `student_user_id` database predicate. Administrative reads,
mutations, and aggregate reports do not imply one another.

## Phase 3 ownership boundary

Every student request operation requires both its named `.own` permission and a
central service-layer ownership query constrained by `student_user_id`. A request
number or UUID in a URL is never authorization. Cross-student reads and writes are
reported as not found so they do not disclose resource existence. Attachment
create/read/delete applies the same owned-request boundary in addition to request
state, storage, and scan checks.

The `admin.requests.*` and `admin.catalog.*` grants are separate administrative
capabilities and do not bypass the student-owned services implicitly. Phase 3
seeds those grants for `ADMIN` and `SYSTEM`, but does not implement the full
administrative request interface. Deny-by-default remains the rule for any new
service or route.

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

Future chat and export features must add a named permission and perform
ownership/tenant checks at each server boundary. Being able to guess an ID, load
a client route, or hold an old cookie must never grant authorization.
