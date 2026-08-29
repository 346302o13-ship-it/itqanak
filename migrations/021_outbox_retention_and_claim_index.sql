-- Bound outbox_events growth and keep the claim hot path fast.
--
-- Every worker claim query (attachment scan processors, the WhatsApp support
-- processor) filters `WHERE event_type = ? AND status IN
-- ('PENDING','RETRY','PROCESSING') AND available_at <= now()` and orders by
-- `created_at, id`. The existing outbox_events_delivery_idx is keyed
-- (status, available_at, created_at) with no event_type, so as unconsumed rows
-- accumulate -- notification, quote and message events have no runtime consumer
-- today -- every claim scans an ever-growing PENDING prefix and the table grows
-- until the disk fills and all writes stop.
--
-- This partial index serves the claim predicate directly and stays small
-- because it only covers rows that are still in flight. The retention sweep
-- (apps/worker OutboxRetentionWorkLoop) prunes terminal rows after 30 days and
-- rows still unclaimed after 90 days -- scan and WhatsApp jobs exhaust their
-- bounded retries in minutes, so anything unclaimed for months is dead.
--
-- Plain CREATE INDEX: migrations run inside one transaction, so CONCURRENTLY is
-- not available. outbox_events is small at rollout; if it has already grown,
-- build the index out-of-band with CREATE INDEX CONCURRENTLY before deploying
-- and this statement becomes a no-op via IF NOT EXISTS.

CREATE INDEX IF NOT EXISTS outbox_events_claim_idx
  ON outbox_events (event_type, available_at, created_at, id)
  WHERE status IN ('PENDING', 'RETRY', 'PROCESSING');
