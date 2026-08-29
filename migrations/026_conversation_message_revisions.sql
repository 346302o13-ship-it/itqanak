-- Sender edits and deletes for the unified conversation.
--
-- support_messages rows are immutable: the support_messages_append_only trigger
-- rejects UPDATE/DELETE and migration 016/019 REVOKE those privileges from
-- itqanak_runtime. Rather than weaken that ledger (the mirror/projection
-- triggers all assume insert-only), an edit or a delete is recorded as a new
-- immutable row in this sidecar. Reads fold the latest revision over the base
-- message: the newest EDIT supplies the effective body and an "edited" marker;
-- a DELETE tombstones the message. Both are restricted to the original sender
-- and to TEXT messages; the edit window is a service-level policy, while the
-- integrity checks below are enforced here as defense in depth.

CREATE TABLE support_message_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES support_messages (id) ON DELETE RESTRICT,
  conversation_id UUID NOT NULL REFERENCES support_conversations (id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('EDIT', 'DELETE')),
  previous_body TEXT NOT NULL,
  new_body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT support_message_revisions_body_shape_check CHECK (
    (action = 'EDIT'
      AND new_body IS NOT NULL
      AND char_length(new_body) BETWEEN 1 AND 10000)
    OR (action = 'DELETE' AND new_body IS NULL)
  )
);

-- Latest-revision-per-message lookups (the read fold, service validation).
CREATE INDEX support_message_revisions_message_idx
  ON support_message_revisions (message_id, created_at DESC, id DESC);

-- "What changed in this conversation since my last poll" cursor scan.
CREATE INDEX support_message_revisions_conversation_created_idx
  ON support_message_revisions (conversation_id, created_at);

CREATE FUNCTION validate_support_message_revision()
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
  IF target_sender IS NULL OR target_sender <> NEW.actor_user_id THEN
    RAISE EXCEPTION 'only the original sender may edit or delete a support message';
  END IF;
  IF target_content <> 'TEXT' THEN
    RAISE EXCEPTION 'only text support messages may be edited or deleted';
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

CREATE TRIGGER support_message_revisions_validate
BEFORE INSERT ON support_message_revisions
FOR EACH ROW EXECUTE FUNCTION validate_support_message_revision();

CREATE FUNCTION reject_support_message_revision_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support message revisions are append-only';
END;
$$;

CREATE TRIGGER support_message_revisions_append_only
BEFORE UPDATE OR DELETE ON support_message_revisions
FOR EACH ROW EXECUTE FUNCTION reject_support_message_revision_mutation();
CREATE TRIGGER support_message_revisions_reject_truncate
BEFORE TRUNCATE ON support_message_revisions
FOR EACH STATEMENT EXECUTE FUNCTION reject_support_message_revision_mutation();

-- Low-latency hint on the shared stream channel (migration 022) so a connected
-- SSE handler nudges the client to re-fetch after an edit or delete instead of
-- waiting for the next poll tick. Body-free and best-effort, like the insert
-- hint: a missed notification is caught by the incremental revision poll.
CREATE FUNCTION notify_conversation_stream_revision()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify(
    'itqanak_conversation',
    json_build_object(
      'conversationId', NEW.conversation_id,
      'messageId', NEW.message_id,
      'kind', 'revision',
      'action', NEW.action
    )::text
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER support_message_revisions_notify_stream
AFTER INSERT ON support_message_revisions
FOR EACH ROW EXECUTE FUNCTION notify_conversation_stream_revision();

-- Migration 014 grants the runtime role SELECT/INSERT/UPDATE/DELETE on new
-- public tables by default. Keep this ledger append-only in the same way its
-- sibling tables are: rows are only ever inserted.
DO $runtime_revision_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE UPDATE, DELETE ON TABLE support_message_revisions FROM itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE support_message_revisions TO itqanak_runtime;
END;
$runtime_revision_privileges$;
