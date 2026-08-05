# Cloudflare rollout boundary

Cloudflare is intentionally not configured by this repository in Phase 1. Before enabling DNS/proxying:

1. Validate loopback Gateway live/readiness checks on the host.
2. Create Access policy for the administrative hostname; use least-privilege identity groups.
3. Configure HTTPS/TLS, origin reachability, rate limiting, WAF rules, and security headers deliberately.
4. Keep application-level `ADMIN` authorization enabled; Access is not a replacement.
5. Register WhatsApp webhook only in the notifications phase after signature verification and secret handling are implemented.
