-- Real-time hint channel for the unified conversation stream.
--
-- The chat client polls an incremental afterId cursor as its reliable
-- transport. This trigger adds a low-latency accelerator: every inserted
-- support_messages row emits a small pg_notify payload so a connected
-- Server-Sent Events handler can nudge the client to fetch the delta
-- immediately instead of waiting for the next poll tick. The payload carries
-- no message body -- only ids and the sender type -- and pg_notify is
-- best-effort, so a missed notification is harmless: the poll still catches it.

CREATE FUNCTION notify_conversation_stream()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'itqanak_conversation',
    json_build_object(
      'conversationId', NEW.conversation_id,
      'messageId', NEW.id,
      'senderType', NEW.sender_type,
      'sentAt', NEW.sent_at
    )::text
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER support_messages_notify_stream
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION notify_conversation_stream();
