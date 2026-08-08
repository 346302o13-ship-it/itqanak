# Authentication

## Design

ITQANAK uses opaque, server-side sessions. A browser receives a random
`selector.validator` value; PostgreSQL stores the selector and a SHA-256 hash of
the validator, never the raw session value. The browser never receives a JWT and
the application does not use `localStorage` or `sessionStorage` for credentials,
reset links, or sessions.

The production session cookie is `__Host-itqanak_session`; development uses
`itqanak_dev_session`. It is `HttpOnly`, `SameSite=Lax`, `Path=/`, and `Secure`
in production. The `__Host-` prefix prevents a `Domain` attribute and requires a
root path and Secure transport. A separate non-HttpOnly CSRF cookie contains no
credential and exists only to pair a page form with its request.

## Account lifecycle

1. Public registration creates only a `STUDENT` in `PENDING_VERIFICATION`, records
   the Terms and Privacy versions accepted, and queues a verification email.
2. The verification link carries a single-use opaque token. Its database row has
   a selector and validator hash, expiry, used/revoked timestamps; it never stores
   the raw token. Successful verification activates the account.
3. Login accepts only an active, verified account and creates a session. Failed
   credentials and unavailable accounts use generic responses to limit account
   enumeration.
4. Logout revokes the matching server record and clears the cookie.
5. Reset requests are always externally generic. Reset tokens are single-use;
   successful reset changes the password, invalidates every active session, and
   queues a password-changed notice.
6. A signed-in user can change password after current-password verification. This
   also revokes other sessions and rotates the current browser session.

The form submits the exact legal-document versions shown beside its consent
controls. Registration rejects a version mismatch, so a rolling configuration
change cannot record consent to a document the browser did not display.

Passwords use Argon2id with 19 MiB memory (`memoryCost=19456`), time cost 2,
parallelism 1, and 32-byte output. Policy is 12–128 characters and rejects NUL.
The chosen profile was exercised in this repository's 4 GiB development target;
re-benchmark on the production CPU before raising cost. The login and recovery
Redis limits are intentional compensating controls for this expensive operation.
Run the safe, non-persistent measurement with `pnpm auth:benchmark-password`;
it generates a temporary in-memory sample and prints only elapsed time and
parameters.

## Browser request protections

Every state-changing auth/account route accepts a form body only and checks all
of: form content type, expected Host, trusted Origin, a constant-time CSRF
comparison, and a same-site CSRF cookie. The middleware issues a fresh CSRF value
on the first Arabic page request and forwards that same value internally so the
first server-rendered form remains usable. Redirect targets are limited to local
`/ar/...` paths.

Redis rate-limit keys use SHA-256 subjects, not raw IPs, emails, user IDs, or token
selectors. Registration, login, resend, and reset requests have separate IP and
normalized-email scopes; confirmation has IP and selector scopes; session creation
and sensitive account changes have user scopes. When a required limiter cannot be
reached, the protected operation fails closed.

## Relevant routes

| Purpose                   | Arabic page                                           | POST endpoint                                             |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Register                  | `/ar/auth/register`                                   | `/api/auth/register`                                      |
| Login/logout              | `/ar/auth/login`                                      | `/api/auth/login`, `/api/auth/logout`                     |
| Verify/resend             | `/ar/auth/verify-email`                               | `/api/auth/verify-email`, `/api/auth/resend-verification` |
| Recovery/reset            | `/ar/auth/forgot-password`, `/ar/auth/reset-password` | `/api/auth/forgot-password`, `/api/auth/reset-password`   |
| Account/security/sessions | `/ar/account/...`                                     | `/api/account/...`                                        |

Authentication failures, session revocation, role changes, password changes,
email requests, and profile changes create append-only security-audit records.
Those records include identifiers/correlation fields and hashed IP data only;
they do not record passwords, raw tokens, cookies, or email payloads.
