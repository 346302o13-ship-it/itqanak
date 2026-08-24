-- Request administration and one durable student/administrator conversation
-- per service request.
-- This migration is forward-only. Do not edit after it is applied.

ALTER TABLE service_request_attachments
  DROP CONSTRAINT service_request_attachments_normalized_extension_check,
  ADD CONSTRAINT service_request_attachments_normalized_extension_check
    CHECK (
      normalized_extension IN (
        '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg', '.jpeg',
        '.mp3', '.m4a', '.ogg', '.wav', '.webm'
      )
    );

CREATE TABLE service_request_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  assigned_admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  unassigned_at TIMESTAMPTZ,
  unassigned_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  CHECK ((unassigned_at IS NULL) = (unassigned_by_user_id IS NULL)),
  CHECK (unassigned_at IS NULL OR unassigned_at >= assigned_at)
);

CREATE UNIQUE INDEX service_request_assignments_current_request_unique
  ON service_request_assignments (request_id)
  WHERE unassigned_at IS NULL;
CREATE INDEX service_request_assignments_admin_current_idx
  ON service_request_assignments (assigned_admin_user_id, assigned_at DESC, request_id)
  WHERE unassigned_at IS NULL;
CREATE INDEX service_request_assignments_request_history_idx
  ON service_request_assignments (request_id, assigned_at, id);

CREATE FUNCTION validate_service_request_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.assigned_admin_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'assigned request user is not an active administrator';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = NEW.assigned_by_user_id AND role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'request assigner does not have the ADMIN role';
  END IF;

  IF NEW.unassigned_by_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = NEW.unassigned_by_user_id AND role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'request unassigner does not have the ADMIN role';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_assignments_validate
BEFORE INSERT OR UPDATE ON service_request_assignments
FOR EACH ROW EXECUTE FUNCTION validate_service_request_assignment();

CREATE TABLE service_request_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES service_requests(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ,
  CHECK (updated_at >= created_at),
  CHECK (last_message_at IS NULL OR last_message_at >= created_at)
);

INSERT INTO service_request_conversations (request_id, created_at, updated_at)
SELECT id, created_at, created_at
FROM service_requests
ON CONFLICT (request_id) DO NOTHING;

CREATE FUNCTION create_service_request_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO service_request_conversations (request_id, created_at, updated_at)
  VALUES (NEW.id, NEW.created_at, NEW.created_at)
  ON CONFLICT (request_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_requests_create_conversation
AFTER INSERT ON service_requests
FOR EACH ROW EXECUTE FUNCTION create_service_request_conversation();

CREATE TABLE service_request_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES service_request_conversations(id) ON DELETE RESTRICT,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('STUDENT', 'ADMIN', 'SYSTEM')),
  sender_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  content_type TEXT NOT NULL
    CHECK (content_type IN ('TEXT', 'IMAGE', 'AUDIO', 'FILE', 'SYSTEM', 'ACTION')),
  body TEXT CHECK (body IS NULL OR char_length(body) BETWEEN 1 AND 10000),
  attachment_id UUID REFERENCES service_request_attachments(id) ON DELETE RESTRICT,
  client_message_id UUID,
  client_payload_fingerprint CHAR(64)
    CHECK (client_payload_fingerprint IS NULL OR client_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (sender_type = 'SYSTEM' AND sender_user_id IS NULL)
    OR (sender_type IN ('STUDENT', 'ADMIN') AND sender_user_id IS NOT NULL)
  ),
  CHECK ((client_message_id IS NULL) = (client_payload_fingerprint IS NULL)),
  CHECK (
    (content_type = 'TEXT' AND body IS NOT NULL AND attachment_id IS NULL)
    OR (content_type IN ('IMAGE', 'AUDIO', 'FILE') AND attachment_id IS NOT NULL)
    OR (content_type IN ('SYSTEM', 'ACTION') AND body IS NOT NULL AND attachment_id IS NULL)
  )
);

CREATE UNIQUE INDEX service_request_messages_client_id_unique
  ON service_request_messages (conversation_id, sender_user_id, client_message_id)
  WHERE sender_user_id IS NOT NULL AND client_message_id IS NOT NULL;
CREATE INDEX service_request_messages_conversation_sent_idx
  ON service_request_messages (conversation_id, sent_at DESC, id DESC);

CREATE FUNCTION validate_service_request_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_request_id UUID;
  conversation_student_id UUID;
  attachment_request_id UUID;
  attachment_storage_status TEXT;
  attachment_scan_status TEXT;
  attachment_mime_type TEXT;
BEGIN
  SELECT conversations.request_id, requests.student_user_id
    INTO conversation_request_id, conversation_student_id
  FROM service_request_conversations AS conversations
  INNER JOIN service_requests AS requests ON requests.id = conversations.request_id
  WHERE conversations.id = NEW.conversation_id;

  IF conversation_request_id IS NULL THEN
    RAISE EXCEPTION 'message conversation does not exist';
  END IF;

  IF NEW.sender_type = 'STUDENT' AND NEW.sender_user_id <> conversation_student_id THEN
    RAISE EXCEPTION 'student message sender does not own the request';
  END IF;

  IF NEW.sender_type = 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = NEW.sender_user_id AND role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'administrator message sender does not have the ADMIN role';
  END IF;

  IF NEW.attachment_id IS NOT NULL THEN
    SELECT request_id, storage_status, scan_status, detected_mime_type
      INTO attachment_request_id, attachment_storage_status,
           attachment_scan_status, attachment_mime_type
    FROM service_request_attachments
    WHERE id = NEW.attachment_id AND deleted_at IS NULL;

    IF attachment_request_id IS NULL OR attachment_request_id <> conversation_request_id THEN
      RAISE EXCEPTION 'message attachment does not belong to the request';
    END IF;
    IF attachment_storage_status <> 'STORED' OR attachment_scan_status <> 'CLEAN' THEN
      RAISE EXCEPTION 'message attachment is not stored and clean';
    END IF;
    IF NEW.content_type = 'IMAGE' AND attachment_mime_type NOT LIKE 'image/%' THEN
      RAISE EXCEPTION 'image message attachment is not an image';
    END IF;
    IF NEW.content_type = 'AUDIO' AND attachment_mime_type NOT LIKE 'audio/%' THEN
      RAISE EXCEPTION 'audio message attachment is not audio';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_messages_validate
BEFORE INSERT ON service_request_messages
FOR EACH ROW EXECUTE FUNCTION validate_service_request_message();

CREATE FUNCTION reject_service_request_message_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'service request messages are immutable';
END;
$$;

CREATE TRIGGER service_request_messages_append_only
BEFORE UPDATE OR DELETE ON service_request_messages
FOR EACH ROW EXECUTE FUNCTION reject_service_request_message_mutation();
CREATE TRIGGER service_request_messages_reject_truncate
BEFORE TRUNCATE ON service_request_messages
FOR EACH STATEMENT EXECUTE FUNCTION reject_service_request_message_mutation();

CREATE TABLE service_request_message_receipts (
  message_id UUID NOT NULL REFERENCES service_request_messages(id) ON DELETE RESTRICT,
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

CREATE INDEX service_request_message_receipts_recipient_status_idx
  ON service_request_message_receipts (recipient_user_id, status, updated_at DESC, message_id);

INSERT INTO permissions (code, description) VALUES
  ('requests.chat.read.own', 'Read messages for conversations on owned requests'),
  ('requests.chat.send.own', 'Send messages to conversations on owned requests'),
  ('admin.requests.assign', 'Assign and unassign service requests administratively'),
  ('admin.requests.chat.read', 'Read request conversations administratively'),
  ('admin.requests.chat.send', 'Send request conversation messages administratively')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'requests.chat.read.own'),
  ('STUDENT', 'requests.chat.send.own'),
  ('ADMIN', 'admin.requests.assign'),
  ('ADMIN', 'admin.requests.chat.read'),
  ('ADMIN', 'admin.requests.chat.send'),
  ('SYSTEM', 'admin.requests.chat.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;
