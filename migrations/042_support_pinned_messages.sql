-- Pinned messages for the unified conversation: either party can pin a
-- message (a request brief, a payment link, an important instruction) so it
-- surfaces in a strip at the top of the thread. Conversation-scoped — both
-- the student and the admin see the same pins. A small cap (enforced in the
-- service, not here) keeps the strip readable.

CREATE TABLE support_pinned_messages (
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES support_messages(id) ON DELETE CASCADE,
  pinned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, message_id)
);

CREATE INDEX support_pinned_messages_conversation_idx
  ON support_pinned_messages (conversation_id, pinned_at DESC, message_id);
