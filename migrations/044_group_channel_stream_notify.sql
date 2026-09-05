-- Real-time hint channel for the student group. Mirrors migration 022: every
-- change (a new message, a soft delete, a posting-policy flip) emits a small
-- pg_notify so a connected SSE handler nudges clients to re-fetch instead of
-- waiting for the poll tick. Payload carries no body — best-effort, and the
-- 10s poll stays the reliable transport.

CREATE FUNCTION notify_group_channel_stream()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_NAME = 'group_channel_messages' THEN
    PERFORM pg_notify(
      'itqanak_group_channel',
      json_build_object(
        'kind', CASE WHEN TG_OP = 'UPDATE' THEN 'message_deleted' ELSE 'message' END,
        'messageId', NEW.id,
        'senderType', NEW.sender_type,
        'sentAt', NEW.sent_at
      )::text
    );
  ELSE
    PERFORM pg_notify(
      'itqanak_group_channel',
      json_build_object('kind', 'policy', 'membersCanPost', NEW.members_can_post)::text
    );
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER group_channel_messages_notify_stream
AFTER INSERT OR UPDATE OF deleted_at ON group_channel_messages
FOR EACH ROW EXECUTE FUNCTION notify_group_channel_stream();

CREATE TRIGGER group_channel_settings_notify_stream
AFTER UPDATE OF members_can_post ON group_channel_settings
FOR EACH ROW EXECUTE FUNCTION notify_group_channel_stream();
