# Incident and recovery playbook

## Migration/schema incident

1. Stop rollout and preserve the deployed image and redacted logs.
2. Run `pnpm db:status`/`pnpm db:verify` against the affected environment through protected access.
3. Identify the expected commit and migration ledger state. Do not execute ad-hoc SQL or edit an applied migration.
4. Create a reviewed forward-only remedial migration or restore a verified backup when data integrity requires it.
5. Re-run migration and readiness checks, then record the incident and prevention action.

## Suspected secret exposure

1. Revoke/rotate the secret immediately; treat it as compromised even if access is uncertain.
2. Replace external secret files and restart affected services safely.
3. Inspect redacted access/audit records and provider-side credential activity.
4. Remove the cause, add a regression check, and assess whether users/regulators require notification.

## Host loss

Follow `BACKUP_RESTORE.md`: rebuild from Git, retrieve off-server database and
object-storage copies, restore/test them, bring up services behind loopback,
validate readiness, then perform an approved DNS/Cloudflare cutover and rotate
credentials. A backup stored only on the lost host is not a recovery strategy.
