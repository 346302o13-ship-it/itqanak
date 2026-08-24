# Cloudflare Access for the administrator center

The application keeps its own database-backed `ADMIN` session and permission
checks. Cloudflare Access is an additional outer identity boundary, not a
replacement for those checks. When enabled, the origin validates the signed
`Cf-Access-Jwt-Assertion`, its issuer, application audience, token type, and the
single configured owner email. A forged header or a direct-origin request is
rejected with `403`.

## Required Cloudflare configuration

1. In Zero Trust, create one self-hosted Access application for
   `admin.itqanqhelpstudent.online/*`.
2. Create an `Allow` policy for one exact owner email. Do not allow an entire
   email domain.
3. Prefer an identity provider with MFA and set a short Access session.
4. Copy the team domain and the application's immutable `AUD` tag into the
   production environment. Use the same normalized email when creating the
   platform administrator.

```dotenv
CLOUDFLARE_ACCESS_MODE=enabled
CLOUDFLARE_ACCESS_TEAM_DOMAIN=https://YOUR-TEAM.cloudflareaccess.com
CLOUDFLARE_ACCESS_AUDIENCE=YOUR_APPLICATION_AUD_TAG
CLOUDFLARE_ACCESS_ADMIN_EMAIL=owner@example.com
```

Rebuild/recreate the web container, then verify:

- a private browser is challenged by Cloudflare before the administrator login;
- the allowed identity can reach the platform login and then `/ar/admin`;
- a different Access identity is rejected by the origin;
- a request sent directly to the origin without the Access JWT is rejected;
- the public and student hosts remain accessible.

Never enable the mode with placeholder values. Keep an existing protected SSH
session available during the first rollout so a mistaken Access policy cannot
lock the operator out of recovery.
