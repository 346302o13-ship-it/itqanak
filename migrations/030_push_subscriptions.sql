-- Web Push subscriptions: one row per browser/device that opted in to
-- background notifications. The Worker sends an encrypted Web Push message to
-- every subscription of a notification's recipient when a `user_notifications`
-- row is created (the USER_NOTIFICATION_CREATED outbox event already exists).
-- A gone endpoint (404 / 410) is deleted; transient failures bump failure_count.

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE
    CHECK (char_length(endpoint) BETWEEN 12 AND 2048 AND endpoint LIKE 'https://%'),
  p256dh TEXT NOT NULL CHECK (char_length(p256dh) BETWEEN 8 AND 256),
  auth TEXT NOT NULL CHECK (char_length(auth) BETWEEN 8 AND 256),
  user_agent TEXT CHECK (user_agent IS NULL OR char_length(user_agent) BETWEEN 1 AND 400),
  failure_count SMALLINT NOT NULL DEFAULT 0 CHECK (failure_count BETWEEN 0 AND 32767),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (last_active_at >= created_at)
);

CREATE INDEX push_subscriptions_user_idx ON push_subscriptions (user_id, created_at DESC);

-- Migration 014's default privileges already grant the runtime role
-- SELECT/INSERT/UPDATE/DELETE on new tables, which is exactly what the
-- subscribe / unsubscribe endpoints and the Worker need. Nothing to narrow.
