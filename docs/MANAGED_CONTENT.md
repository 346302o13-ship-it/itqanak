# Managed page content

Administrators can add bilingual content blocks without editing source code or
replacing the platform's core page structure. Blocks can be rendered in either
`LANDING` or `STUDENT_DASHBOARD`, and are ordered by `sortOrder`.

## Content contract

Every block requires Arabic and English titles and bodies. Bodies are stored and
rendered as plain text; HTML is never accepted or interpreted. Presentation is
limited to the typed variants `INFO`, `HIGHLIGHT`, `ANNOUNCEMENT`, and `ACTION`.
An optional call-to-action must include both localized labels and one URL. URLs
are limited to same-site paths beginning with `/` or absolute `https://` URLs;
protocol-relative links, credentials in URLs, scripts, and insecure HTTP links
are rejected.

Published queries always require `active = true` and `deleted_at IS NULL`.
Hiding is reversible. Deleting is a soft delete so the operation remains
auditable, while deleted blocks no longer appear in the administrative list or
published queries. A live slug is unique and each mutation compares an expected
`version`, returning a conflict instead of overwriting a newer edit.

## Authorization and HTTP boundary

- `admin.content.read` permits reading the administration list.
- `admin.content.manage` permits create, update, publish/hide, and delete.
- Browser administration additionally requires the `ADMIN` role and
  `admin.dashboard.view`; a permission by itself does not create an admin session.
- Every write route calls the shared trusted-host, trusted-origin, form-size,
  content-type, and double-submit CSRF checks before authenticating the session
  and calling the service-layer permission check.

The form endpoints are `POST /api/admin/content` and
`POST /api/admin/content/{blockId}`. The second endpoint accepts a typed action
(`update`, `show`, `hide`, or `delete`) and the current block version. Successful
mutations append both a domain history event and a redacted security audit event.
Domain history rejects update, delete, and truncate operations at the database
level.

## Rendering and localization

The public and student renderers select the localized fields on the server and
let React escape them. Existing `/ar/...` or `/en/...` action paths are adapted
to the viewer's current locale. External actions open in a new tab with
`noopener noreferrer`. If there are no active blocks, the renderer returns
nothing and all existing page content remains unchanged.

Schema support is introduced only by the forward migration
`012_managed_content_blocks.sql`; applied migrations must never be edited.
