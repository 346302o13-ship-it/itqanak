-- Relax the support-message revision guard so that:
--   * an administrator can delete any message in a conversation (moderation),
--     not only their own;
--   * a DELETE may target a non-text message (attachments, voice notes, video),
--     while EDIT stays text-only.
-- Everything else (append-only, stale previous_body, double-delete, no-op edit)
-- is unchanged. Recorded as an immutable DELETE revision exactly as before.

CREATE OR REPLACE FUNCTION validate_support_message_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target_conversation UUID;
  target_sender UUID;
  target_content TEXT;
  target_body TEXT;
  latest_action TEXT;
  latest_body TEXT;
  effective_body TEXT;
  actor_is_admin BOOLEAN;
BEGIN
  SELECT conversation_id, sender_user_id, content_type, body
    INTO target_conversation, target_sender, target_content, target_body
    FROM support_messages
    WHERE id = NEW.message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'support message revision target does not exist';
  END IF;
  IF target_conversation <> NEW.conversation_id THEN
    RAISE EXCEPTION 'support message revision conversation does not match the message';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = NEW.actor_user_id AND role_code = 'ADMIN'
  ) INTO actor_is_admin;

  IF target_sender IS NULL OR (target_sender <> NEW.actor_user_id AND NOT actor_is_admin) THEN
    RAISE EXCEPTION 'only the original sender or an administrator may edit or delete a support message';
  END IF;
  IF NEW.action = 'EDIT' AND (target_content <> 'TEXT' OR target_sender <> NEW.actor_user_id) THEN
    RAISE EXCEPTION 'only the original sender may edit, and only text support messages';
  END IF;

  SELECT action, new_body
    INTO latest_action, latest_body
    FROM support_message_revisions
    WHERE message_id = NEW.message_id
    ORDER BY created_at DESC, id DESC
    LIMIT 1;
  IF FOUND THEN
    IF latest_action = 'DELETE' THEN
      RAISE EXCEPTION 'support message is already deleted';
    END IF;
    effective_body := latest_body;
  ELSE
    effective_body := target_body;
  END IF;

  IF NEW.previous_body IS DISTINCT FROM effective_body THEN
    RAISE EXCEPTION 'support message revision previous_body is stale';
  END IF;
  IF NEW.action = 'EDIT' AND NEW.new_body = effective_body THEN
    RAISE EXCEPTION 'support message edit does not change the body';
  END IF;

  RETURN NEW;
END;
$$;
