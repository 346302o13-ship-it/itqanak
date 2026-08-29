-- Emoji reactions for the unified conversation.
--
-- A separate join table so support_messages stays append-only. A reaction is a
-- toggle: one row per (message, user, emoji); un-reacting deletes the row.
-- Migration 014's default privileges already grant the runtime role
-- SELECT/INSERT/UPDATE/DELETE on new public tables, so no explicit grant is
-- needed. The emoji set is enforced in the service against a fixed allowlist;
-- the DB only bounds the length as defense in depth.

CREATE TABLE support_message_reactions (
  message_id UUID NOT NULL REFERENCES support_messages (id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  emoji TEXT NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX support_message_reactions_message_idx
  ON support_message_reactions (message_id);
