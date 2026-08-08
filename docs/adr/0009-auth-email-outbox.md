# ADR 0009: Encrypted authentication-email outbox

## Decision

Authentication mutations enqueue email work in the same transaction. Payloads
that contain a verification or reset token are encrypted with AES-256-GCM using a
separate Docker secret. A worker claims rows with `FOR UPDATE SKIP LOCKED` and
removes the encrypted payload after successful delivery.

## Consequences

Database backups contain ciphertext rather than usable tokens. SMTP delivery is
optional and disabled by default; Mailpit is an opt-in local profile only.
