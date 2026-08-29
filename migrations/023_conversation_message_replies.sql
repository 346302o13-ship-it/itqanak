-- Quoted replies for the unified conversation.
--
-- An optional self-reference from a message to an earlier message in the same
-- conversation. Additive only: existing messages are untouched, the append-only
-- guard on support_messages is unaffected, and a message can still stand alone.
-- Service-level validation enforces same-conversation targeting on insert.

ALTER TABLE support_messages
  ADD COLUMN reply_to_message_id UUID REFERENCES support_messages (id);

CREATE INDEX support_messages_reply_to_idx
  ON support_messages (reply_to_message_id)
  WHERE reply_to_message_id IS NOT NULL;
