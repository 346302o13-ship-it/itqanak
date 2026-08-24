# Meta WhatsApp support notifications

ITQANAK stages durable notifications when a student registration is created or
when a request needs administrator review. The worker claims those rows with a
lease and sends one approved WhatsApp template to the configured support number.
Delivery is idempotent at the outbox boundary, retries transient Meta/network
errors with bounded backoff, and dead-letters permanent template/auth failures.

The integration uses Meta's official Cloud API endpoint:

```text
POST https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages
```

The approved template must contain exactly three body text variables in this
order: event type, platform reference, and a concise summary. Do not put secrets,
passwords, attachment contents, or chat message bodies in the template.

## Production secrets and settings

Create a protected file (mode `0440`, the deployment secrets group) containing a
Meta system-user token with the minimum `whatsapp_business_messaging` permission.
Then set:

```dotenv
WHATSAPP_MODE=dry-run
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_TEMPLATE_NAME=itqanak_support_event_v1
WHATSAPP_TEMPLATE_LANGUAGE=ar
WHATSAPP_GRAPH_API_VERSION=v25.0
WHATSAPP_SUPPORT_RECIPIENT_E164=+966564202263
WHATSAPP_MAX_ATTEMPTS=8
WHATSAPP_NOTIFICATIONS_NOT_BEFORE=2026-08-13T00:00:00Z
ITQANAK_WHATSAPP_ACCESS_TOKEN_SECRET_FILE=/root/itqanak/secrets/whatsapp_access_token
```

Deploy in `dry-run`, create one isolated test event, and confirm it becomes
delivered without making a Meta call. Set `WHATSAPP_NOTIFICATIONS_NOT_BEFORE` to the
actual activation instant so pending historical/test events cannot be sent. Then change
`WHATSAPP_MODE=enabled`, recreate
only the worker, and generate a single operator-approved test notification.
Confirm the support handset receives it and inspect the outbox for no retries or
dead letters. Never paste the token into `.env.production`, a command argument,
CI, chat, or logs.

The configured recipient is the support destination, not necessarily the Meta
sending number. A phone number must already be registered and the template must
be approved in WhatsApp Manager before enabled delivery can succeed.
