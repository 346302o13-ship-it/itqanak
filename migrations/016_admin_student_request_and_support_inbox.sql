-- Administrative student/request creation and one general support conversation
-- per student, independent from service requests. This migration is forward-only.

CREATE TABLE support_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  CHECK (updated_at >= created_at),
  CHECK (last_message_at IS NULL OR last_message_at >= created_at)
);

CREATE INDEX support_conversations_activity_idx
  ON support_conversations (last_message_at DESC NULLS LAST, created_at DESC, id DESC);

-- Requests created through the administrative workflow must still belong to
-- an actual student. The service performs the same check, while this deferred
-- constraint trigger closes direct-SQL and check-then-change races.
CREATE FUNCTION validate_service_request_student_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.student_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'STUDENT'
  ) THEN
    RAISE EXCEPTION 'service request owner is not an active student';
  END IF;

  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER service_requests_validate_student_role
AFTER INSERT OR UPDATE OF student_user_id ON service_requests
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW EXECUTE FUNCTION validate_service_request_student_role();

CREATE FUNCTION validate_support_conversation_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.student_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'STUDENT'
  ) THEN
    RAISE EXCEPTION 'support conversation student is not an active student';
  END IF;

  IF NEW.created_by_user_id <> NEW.student_user_id AND NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.created_by_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'support conversation creator is not an active administrator';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_conversations_validate_participants
BEFORE INSERT OR UPDATE OF student_user_id, created_by_user_id ON support_conversations
FOR EACH ROW EXECUTE FUNCTION validate_support_conversation_participants();

CREATE TABLE support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE RESTRICT,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('STUDENT', 'ADMIN', 'SYSTEM')),
  sender_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  content_type TEXT NOT NULL CHECK (content_type IN ('TEXT', 'SYSTEM', 'ACTION')),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  client_message_id UUID,
  client_payload_fingerprint CHAR(64)
    CHECK (client_payload_fingerprint IS NULL OR client_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (sender_type = 'SYSTEM' AND sender_user_id IS NULL AND content_type IN ('SYSTEM', 'ACTION'))
    OR (sender_type IN ('STUDENT', 'ADMIN') AND sender_user_id IS NOT NULL AND content_type = 'TEXT')
  ),
  CHECK ((client_message_id IS NULL) = (client_payload_fingerprint IS NULL))
);

CREATE UNIQUE INDEX support_messages_client_id_unique
  ON support_messages (conversation_id, sender_user_id, client_message_id)
  WHERE sender_user_id IS NOT NULL AND client_message_id IS NOT NULL;
CREATE INDEX support_messages_conversation_sent_idx
  ON support_messages (conversation_id, sent_at DESC, id DESC);

CREATE FUNCTION validate_support_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_student_id UUID;
BEGIN
  SELECT student_user_id
  INTO conversation_student_id
  FROM support_conversations
  WHERE id = NEW.conversation_id;

  IF conversation_student_id IS NULL THEN
    RAISE EXCEPTION 'support conversation does not exist';
  END IF;

  IF NEW.sender_type = 'STUDENT' AND NEW.sender_user_id <> conversation_student_id THEN
    RAISE EXCEPTION 'student support message sender does not own the conversation';
  END IF;

  IF NEW.sender_type = 'ADMIN' AND NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.sender_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'support message sender is not an active administrator';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER support_messages_validate_sender
BEFORE INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION validate_support_message_sender();

CREATE FUNCTION reject_support_message_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'support messages are immutable';
END;
$$;

CREATE TRIGGER support_messages_append_only
BEFORE UPDATE OR DELETE ON support_messages
FOR EACH ROW EXECUTE FUNCTION reject_support_message_mutation();
CREATE TRIGGER support_messages_reject_truncate
BEFORE TRUNCATE ON support_messages
FOR EACH STATEMENT EXECUTE FUNCTION reject_support_message_mutation();

CREATE TABLE support_message_receipts (
  message_id UUID NOT NULL REFERENCES support_messages(id) ON DELETE RESTRICT,
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('SENT', 'DELIVERED', 'READ')),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_user_id),
  CHECK (updated_at >= created_at),
  CHECK (status = 'SENT' OR delivered_at IS NOT NULL),
  CHECK (status <> 'READ' OR read_at IS NOT NULL),
  CHECK (read_at IS NULL OR delivered_at IS NOT NULL),
  CHECK (read_at IS NULL OR read_at >= delivered_at)
);

CREATE INDEX support_message_receipts_recipient_status_idx
  ON support_message_receipts (recipient_user_id, status, updated_at DESC, message_id);

INSERT INTO permissions (code, description) VALUES
  ('support.chat.read.own', 'Read the authenticated student general support conversation'),
  ('support.chat.send.own', 'Send messages in the authenticated student support conversation'),
  ('admin.support.chat.read', 'Read general student support conversations administratively'),
  ('admin.support.chat.send', 'Open and send general student support conversations administratively')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'support.chat.read.own'),
  ('STUDENT', 'support.chat.send.own'),
  ('ADMIN', 'admin.support.chat.read'),
  ('ADMIN', 'admin.support.chat.send'),
  ('SYSTEM', 'admin.support.chat.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Migration 014 grants bounded runtime access to future tables. Preserve the
-- append-only guarantee for the new support message ledger as defense in depth.
DO $runtime_support_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE UPDATE, DELETE ON TABLE support_messages FROM itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE support_messages TO itqanak_runtime;
END;
$runtime_support_privileges$;
