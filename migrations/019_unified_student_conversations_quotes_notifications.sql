-- One durable conversation per student across general support and every request,
-- versioned service quotes, and a first-party notification inbox.
--
-- support_conversations/support_messages are deliberately evolved in place so
-- no general-support history is forked or lost. Historical per-request chat is
-- copied once and future legacy writes are mirrored during the UI transition.
-- This migration is forward-only. Do not edit after it is applied.

CREATE TABLE unified_conversation_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE RESTRICT,
  request_id UUID REFERENCES service_requests(id) ON DELETE RESTRICT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('local', 's3')),
  storage_bucket TEXT
    CHECK (storage_bucket IS NULL OR char_length(storage_bucket) BETWEEN 3 AND 255),
  storage_key TEXT CHECK (
    storage_key IS NULL
    OR (
      char_length(storage_key) BETWEEN 20 AND 1024
      AND storage_key NOT LIKE '/%'
      AND storage_key NOT LIKE '%..%'
      AND position(chr(92) IN storage_key) = 0
    )
  ),
  original_filename TEXT NOT NULL CHECK (
    char_length(btrim(original_filename)) BETWEEN 1 AND 255
    AND original_filename !~ '[\\/]'
    AND original_filename !~ '[[:cntrl:]]'
  ),
  normalized_extension TEXT NOT NULL CHECK (
    normalized_extension IN (
      '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg', '.jpeg',
      '.mp3', '.m4a', '.ogg', '.wav', '.webm'
    )
  ),
  detected_mime_type TEXT
    CHECK (detected_mime_type IS NULL OR char_length(detected_mime_type) BETWEEN 3 AND 160),
  declared_mime_type TEXT NOT NULL
    CHECK (char_length(declared_mime_type) BETWEEN 3 AND 160),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  sha256 CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  storage_status TEXT NOT NULL DEFAULT 'PENDING_UPLOAD' CHECK (
    storage_status IN ('PENDING_UPLOAD', 'STORED', 'DELETE_PENDING', 'DELETED', 'UPLOAD_FAILED')
  ),
  scan_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (
    scan_status IN (
      'PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_ERROR',
      'SCAN_SKIPPED_DEVELOPMENT', 'NOT_REQUIRED', 'REJECTED'
    )
  ),
  scan_started_at TIMESTAMPTZ,
  scan_completed_at TIMESTAMPTZ,
  scan_threat_name TEXT
    CHECK (scan_threat_name IS NULL OR char_length(scan_threat_name) BETWEEN 1 AND 160),
  scan_attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (scan_attempt_count BETWEEN 0 AND 100),
  scan_next_attempt_at TIMESTAMPTZ,
  scan_last_error_code TEXT
    CHECK (scan_last_error_code IS NULL OR scan_last_error_code ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (storage_provider = 'local' AND storage_bucket IS NULL)
    OR (storage_provider = 's3' AND storage_bucket IS NOT NULL)
  ),
  CHECK (
    storage_key IS NULL
    OR storage_key LIKE 'conversations/' || conversation_id::text || '/' || id::text || '/%'
  ),
  CHECK (
    storage_status <> 'STORED'
    OR (storage_key IS NOT NULL AND sha256 IS NOT NULL AND detected_mime_type IS NOT NULL)
  ),
  CHECK (storage_status <> 'DELETE_PENDING' OR storage_key IS NOT NULL),
  CHECK (
    scan_status = 'NOT_REQUIRED'
    OR (
      storage_status IN ('STORED', 'DELETE_PENDING', 'DELETED')
      AND storage_key IS NOT NULL AND sha256 IS NOT NULL AND detected_mime_type IS NOT NULL
    )
  ),
  CHECK (
    scan_status NOT IN (
      'CLEAN', 'INFECTED', 'SCAN_ERROR', 'SCAN_SKIPPED_DEVELOPMENT', 'REJECTED'
    ) OR scan_completed_at IS NOT NULL
  ),
  CHECK (scan_threat_name IS NULL OR scan_status = 'INFECTED'),
  CHECK (scan_started_at IS NULL OR scan_started_at >= created_at),
  CHECK (scan_completed_at IS NULL OR scan_completed_at >= created_at),
  CHECK (scan_started_at IS NULL OR scan_completed_at IS NULL OR scan_completed_at >= scan_started_at),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (deleted_at IS NULL OR storage_status IN ('DELETE_PENDING', 'DELETED'))
);

CREATE UNIQUE INDEX unified_conversation_attachments_object_key_unique
  ON unified_conversation_attachments (
    storage_provider, COALESCE(storage_bucket, ''), storage_key
  )
  WHERE storage_key IS NOT NULL;
CREATE INDEX unified_conversation_attachments_conversation_created_idx
  ON unified_conversation_attachments (conversation_id, created_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX unified_conversation_attachments_scan_delivery_idx
  ON unified_conversation_attachments (scan_status, scan_next_attempt_at, created_at, id)
  WHERE deleted_at IS NULL AND storage_status = 'STORED';

CREATE FUNCTION validate_unified_conversation_attachment_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_student_id UUID;
  request_student_id UUID;
BEGIN
  SELECT student_user_id INTO conversation_student_id
  FROM support_conversations
  WHERE id = NEW.conversation_id;

  IF conversation_student_id IS NULL THEN
    RAISE EXCEPTION 'unified attachment conversation does not exist';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.uploaded_by_user_id <> conversation_student_id AND NOT EXISTS (
      SELECT 1 FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.id = NEW.uploaded_by_user_id
        AND users.status = 'ACTIVE'
        AND user_roles.role_code = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'unified attachment uploader is not a conversation participant';
    END IF;
  END IF;

  IF NEW.request_id IS NOT NULL THEN
    SELECT student_user_id INTO request_student_id
    FROM service_requests
    WHERE id = NEW.request_id;
    IF request_student_id IS NULL OR request_student_id <> conversation_student_id THEN
      RAISE EXCEPTION 'unified attachment request does not belong to the conversation student';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND ROW(
    NEW.conversation_id, NEW.request_id, NEW.uploaded_by_user_id,
    NEW.storage_provider, NEW.storage_bucket, NEW.original_filename,
    NEW.normalized_extension, NEW.declared_mime_type, NEW.size_bytes, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.conversation_id, OLD.request_id, OLD.uploaded_by_user_id,
    OLD.storage_provider, OLD.storage_bucket, OLD.original_filename,
    OLD.normalized_extension, OLD.declared_mime_type, OLD.size_bytes, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'unified attachment identity and declared metadata are immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER unified_conversation_attachments_validate_identity
BEFORE INSERT OR UPDATE ON unified_conversation_attachments
FOR EACH ROW EXECUTE FUNCTION validate_unified_conversation_attachment_identity();

ALTER TABLE support_messages
  ADD COLUMN request_id UUID REFERENCES service_requests(id) ON DELETE RESTRICT,
  ADD COLUMN attachment_id UUID
    REFERENCES unified_conversation_attachments(id) ON DELETE RESTRICT,
  ADD COLUMN legacy_request_attachment_id UUID
    REFERENCES service_request_attachments(id) ON DELETE RESTRICT,
  ADD COLUMN source_request_message_id UUID
    REFERENCES service_request_messages(id) ON DELETE RESTRICT,
  ADD COLUMN source_request_event_id BIGINT
    REFERENCES service_request_events(id) ON DELETE RESTRICT;

ALTER TABLE support_messages
  DROP CONSTRAINT support_messages_content_type_check,
  DROP CONSTRAINT support_messages_check;

ALTER TABLE support_messages
  ADD CONSTRAINT support_messages_content_type_check
    CHECK (content_type IN ('TEXT', 'IMAGE', 'AUDIO', 'FILE', 'SYSTEM', 'ACTION')),
  ADD CONSTRAINT support_messages_sender_content_check CHECK (
    (sender_type = 'SYSTEM' AND sender_user_id IS NULL
      AND content_type IN ('SYSTEM', 'ACTION'))
    OR
    (sender_type IN ('STUDENT', 'ADMIN') AND sender_user_id IS NOT NULL
      AND content_type IN ('TEXT', 'IMAGE', 'AUDIO', 'FILE', 'ACTION'))
  ),
  ADD CONSTRAINT support_messages_payload_shape_check CHECK (
    (content_type IN ('TEXT', 'SYSTEM', 'ACTION')
      AND attachment_id IS NULL AND legacy_request_attachment_id IS NULL)
    OR
    (content_type IN ('IMAGE', 'AUDIO', 'FILE')
      AND ((attachment_id IS NOT NULL)::integer
        + (legacy_request_attachment_id IS NOT NULL)::integer) = 1)
  ),
  ADD CONSTRAINT support_messages_source_exclusive_check CHECK (
    source_request_message_id IS NULL OR source_request_event_id IS NULL
  );

CREATE INDEX support_messages_attachment_idx
  ON support_messages (attachment_id)
  WHERE attachment_id IS NOT NULL;
CREATE INDEX support_messages_legacy_request_attachment_idx
  ON support_messages (legacy_request_attachment_id)
  WHERE legacy_request_attachment_id IS NOT NULL;
CREATE UNIQUE INDEX support_messages_source_request_message_unique
  ON support_messages (source_request_message_id)
  WHERE source_request_message_id IS NOT NULL;
CREATE UNIQUE INDEX support_messages_source_request_event_unique
  ON support_messages (source_request_event_id)
  WHERE source_request_event_id IS NOT NULL;
CREATE INDEX support_messages_request_sent_idx
  ON support_messages (request_id, sent_at, id)
  WHERE request_id IS NOT NULL;

CREATE TABLE service_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES support_conversations(id) ON DELETE RESTRICT,
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN 1 AND 1000000000),
  currency CHAR(3) NOT NULL CHECK (currency IN ('SAR', 'AED', 'KWD')),
  minor_unit SMALLINT NOT NULL CHECK (
    (currency IN ('SAR', 'AED') AND minor_unit = 2)
    OR (currency = 'KWD' AND minor_unit = 3)
  ),
  description_ar TEXT NOT NULL
    CHECK (char_length(btrim(description_ar)) BETWEEN 2 AND 2000),
  description_en TEXT NOT NULL
    CHECK (char_length(btrim(description_en)) BETWEEN 2 AND 2000),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  client_quote_id UUID NOT NULL,
  client_payload_fingerprint CHAR(64) NOT NULL
    CHECK (client_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  response_client_id UUID,
  response_payload_fingerprint CHAR(64)
    CHECK (
      response_payload_fingerprint IS NULL
      OR response_payload_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  last_actor_type TEXT NOT NULL CHECK (last_actor_type IN ('ADMIN', 'STUDENT', 'SYSTEM')),
  last_actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    (last_actor_type = 'SYSTEM' AND last_actor_user_id IS NULL)
    OR (last_actor_type IN ('ADMIN', 'STUDENT') AND last_actor_user_id IS NOT NULL)
  ),
  CHECK ((response_client_id IS NULL) = (response_payload_fingerprint IS NULL)),
  CHECK (
    (status IN ('PENDING', 'EXPIRED', 'WITHDRAWN')
      AND response_client_id IS NULL AND responded_at IS NULL)
    OR
    (status IN ('ACCEPTED', 'REJECTED')
      AND response_client_id IS NOT NULL AND responded_at IS NOT NULL)
  ),
  UNIQUE (created_by_user_id, client_quote_id),
  UNIQUE (student_user_id, response_client_id)
);

CREATE UNIQUE INDEX service_quotes_one_pending_per_request_idx
  ON service_quotes (request_id)
  WHERE status = 'PENDING';
CREATE INDEX service_quotes_conversation_created_idx
  ON service_quotes (conversation_id, created_at DESC, id DESC);
CREATE INDEX service_quotes_student_status_idx
  ON service_quotes (student_user_id, status, expires_at, created_at DESC);

-- An accepted quote creates one unpaid manual due. The mapping preserves
-- idempotency without changing migration 015's immutable finance schema.
CREATE TABLE service_quote_finance_dues (
  quote_id UUID PRIMARY KEY REFERENCES service_quotes(id) ON DELETE RESTRICT,
  due_id UUID NOT NULL UNIQUE REFERENCES finance_dues(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION validate_service_quote_finance_due()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM service_quotes AS quotes
    INNER JOIN finance_dues AS dues ON dues.id = NEW.due_id
    WHERE quotes.id = NEW.quote_id
      AND quotes.status = 'ACCEPTED'
      AND dues.request_id = quotes.request_id
      AND dues.student_user_id = quotes.student_user_id
      AND dues.amount_minor = quotes.amount_minor
      AND dues.currency = quotes.currency
      AND dues.minor_unit = quotes.minor_unit
      AND dues.status = 'UNPAID'
  ) THEN
    RAISE EXCEPTION 'accepted quote and finance due do not match';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_quote_finance_dues_validate
BEFORE INSERT ON service_quote_finance_dues
FOR EACH ROW EXECUTE FUNCTION validate_service_quote_finance_due();

CREATE FUNCTION reject_service_quote_finance_due_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'service quote finance mappings are append-only';
END;
$$;

CREATE TRIGGER service_quote_finance_dues_append_only
BEFORE UPDATE OR DELETE ON service_quote_finance_dues
FOR EACH ROW EXECUTE FUNCTION reject_service_quote_finance_due_mutation();
CREATE TRIGGER service_quote_finance_dues_reject_truncate
BEFORE TRUNCATE ON service_quote_finance_dues
FOR EACH STATEMENT EXECUTE FUNCTION reject_service_quote_finance_due_mutation();

ALTER TABLE support_messages
  ADD COLUMN quote_id UUID REFERENCES service_quotes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT support_messages_quote_action_check
    CHECK (quote_id IS NULL OR content_type = 'ACTION');

CREATE INDEX support_messages_quote_idx
  ON support_messages (quote_id, sent_at, id)
  WHERE quote_id IS NOT NULL;

CREATE FUNCTION validate_service_quote_identity_and_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_student_id UUID;
  request_student_id UUID;
BEGIN
  SELECT student_user_id INTO conversation_student_id
  FROM support_conversations
  WHERE id = NEW.conversation_id
  FOR SHARE;

  SELECT student_user_id INTO request_student_id
  FROM service_requests
  WHERE id = NEW.request_id
  FOR SHARE;

  IF conversation_student_id IS NULL
     OR request_student_id IS NULL
     OR conversation_student_id IS DISTINCT FROM NEW.student_user_id
     OR request_student_id IS DISTINCT FROM NEW.student_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'service quote conversation, request, and student do not match',
      CONSTRAINT = 'service_quotes_identity_match';
  END IF;

  IF NEW.last_actor_type = 'ADMIN' AND NOT EXISTS (
    SELECT 1 FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.last_actor_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'service quote actor is not an active administrator';
  END IF;

  IF NEW.last_actor_type = 'STUDENT'
     AND NEW.last_actor_user_id IS DISTINCT FROM NEW.student_user_id THEN
    RAISE EXCEPTION 'service quote student actor does not own the quote';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.id = NEW.created_by_user_id
        AND users.status = 'ACTIVE'
        AND user_roles.role_code = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'service quote creator is not an active administrator';
    END IF;
    IF NEW.status <> 'PENDING'
       OR NEW.version <> 1
       OR NEW.last_actor_type <> 'ADMIN'
       OR NEW.last_actor_user_id IS DISTINCT FROM NEW.created_by_user_id THEN
      RAISE EXCEPTION 'service quote must be created pending by its administrator';
    END IF;
    RETURN NEW;
  END IF;

  IF ROW(
    NEW.conversation_id, NEW.request_id, NEW.student_user_id,
    NEW.created_by_user_id, NEW.amount_minor, NEW.currency, NEW.minor_unit,
    NEW.description_ar, NEW.description_en, NEW.expires_at,
    NEW.client_quote_id, NEW.client_payload_fingerprint, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.conversation_id, OLD.request_id, OLD.student_user_id,
    OLD.created_by_user_id, OLD.amount_minor, OLD.currency, OLD.minor_unit,
    OLD.description_ar, OLD.description_en, OLD.expires_at,
    OLD.client_quote_id, OLD.client_payload_fingerprint, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'service quote financial and identity fields are immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'service quote update must increment version and timestamp';
  END IF;

  IF OLD.status <> 'PENDING'
     OR NEW.status NOT IN ('ACCEPTED', 'REJECTED', 'EXPIRED', 'WITHDRAWN') THEN
    RAISE EXCEPTION 'invalid service quote status transition';
  END IF;

  IF NEW.status IN ('ACCEPTED', 'REJECTED') AND NEW.last_actor_type <> 'STUDENT' THEN
    RAISE EXCEPTION 'service quote response must be made by its student';
  END IF;
  IF NEW.status = 'WITHDRAWN' AND NEW.last_actor_type <> 'ADMIN' THEN
    RAISE EXCEPTION 'service quote withdrawal must be made by an administrator';
  END IF;
  IF NEW.status = 'EXPIRED' AND NEW.last_actor_type <> 'SYSTEM' THEN
    RAISE EXCEPTION 'service quote expiry must be a system transition';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_quotes_validate_identity_and_transition
BEFORE INSERT OR UPDATE ON service_quotes
FOR EACH ROW EXECUTE FUNCTION validate_service_quote_identity_and_transition();

CREATE FUNCTION reject_service_quote_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'service quotes cannot be deleted or truncated';
END;
$$;

CREATE TRIGGER service_quotes_reject_delete
BEFORE DELETE ON service_quotes
FOR EACH ROW EXECUTE FUNCTION reject_service_quote_mutation();
CREATE TRIGGER service_quotes_reject_truncate
BEFORE TRUNCATE ON service_quotes
FOR EACH STATEMENT EXECUTE FUNCTION reject_service_quote_mutation();

CREATE OR REPLACE FUNCTION validate_support_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_student_id UUID;
  request_student_id UUID;
  attachment_request_id UUID;
  attachment_conversation_id UUID;
  attachment_uploader_id UUID;
  attachment_storage_status TEXT;
  attachment_scan_status TEXT;
  attachment_mime_type TEXT;
  quote_conversation_id UUID;
  quote_request_id UUID;
BEGIN
  SELECT student_user_id INTO conversation_student_id
  FROM support_conversations
  WHERE id = NEW.conversation_id;

  IF conversation_student_id IS NULL THEN
    RAISE EXCEPTION 'support conversation does not exist';
  END IF;

  IF NEW.sender_type = 'STUDENT' AND NEW.sender_user_id <> conversation_student_id THEN
    RAISE EXCEPTION 'student support message sender does not own the conversation';
  END IF;

  IF NEW.sender_type = 'ADMIN'
     AND NEW.source_request_message_id IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM users
       INNER JOIN user_roles ON user_roles.user_id = users.id
       WHERE users.id = NEW.sender_user_id
         AND users.status = 'ACTIVE'
         AND user_roles.role_code = 'ADMIN'
     ) THEN
    RAISE EXCEPTION 'support message sender is not an active administrator';
  END IF;

  IF NEW.request_id IS NOT NULL THEN
    SELECT student_user_id INTO request_student_id
    FROM service_requests
    WHERE id = NEW.request_id;
    IF request_student_id IS NULL OR request_student_id <> conversation_student_id THEN
      RAISE EXCEPTION 'support message request does not belong to the conversation student';
    END IF;
  END IF;

  IF NEW.attachment_id IS NOT NULL THEN
    SELECT conversation_id, request_id, uploaded_by_user_id, storage_status, scan_status,
           detected_mime_type
      INTO attachment_conversation_id, attachment_request_id, attachment_uploader_id,
           attachment_storage_status,
           attachment_scan_status, attachment_mime_type
    FROM unified_conversation_attachments
    WHERE id = NEW.attachment_id AND deleted_at IS NULL;

    IF attachment_conversation_id IS NULL OR attachment_conversation_id <> NEW.conversation_id THEN
      RAISE EXCEPTION 'support message attachment does not belong to its conversation';
    END IF;
    IF attachment_request_id IS DISTINCT FROM NEW.request_id THEN
      RAISE EXCEPTION 'support message attachment request linkage does not match';
    END IF;
    IF NEW.sender_type = 'STUDENT' AND attachment_uploader_id <> NEW.sender_user_id THEN
      RAISE EXCEPTION 'student cannot send an attachment uploaded by another user';
    END IF;
    IF attachment_storage_status <> 'STORED'
       OR attachment_scan_status NOT IN ('CLEAN', 'SCAN_SKIPPED_DEVELOPMENT') THEN
      RAISE EXCEPTION 'support message attachment is not stored and allowed';
    END IF;
    IF NEW.content_type = 'IMAGE' AND attachment_mime_type NOT LIKE 'image/%' THEN
      RAISE EXCEPTION 'image support message attachment is not an image';
    END IF;
    IF NEW.content_type = 'AUDIO' AND attachment_mime_type NOT LIKE 'audio/%' THEN
      RAISE EXCEPTION 'audio support message attachment is not audio';
    END IF;
  END IF;

  IF NEW.legacy_request_attachment_id IS NOT NULL THEN
    SELECT request_id, uploaded_by_user_id, storage_status, scan_status, detected_mime_type
      INTO attachment_request_id, attachment_uploader_id, attachment_storage_status,
           attachment_scan_status, attachment_mime_type
    FROM service_request_attachments
    WHERE id = NEW.legacy_request_attachment_id AND deleted_at IS NULL;

    IF attachment_request_id IS NULL OR attachment_request_id <> NEW.request_id THEN
      RAISE EXCEPTION 'legacy support message attachment does not belong to its request';
    END IF;
    IF NEW.sender_type = 'STUDENT' AND attachment_uploader_id <> NEW.sender_user_id THEN
      RAISE EXCEPTION 'student cannot send an attachment uploaded by another user';
    END IF;
    IF attachment_storage_status <> 'STORED'
       OR attachment_scan_status NOT IN ('CLEAN', 'SCAN_SKIPPED_DEVELOPMENT') THEN
      RAISE EXCEPTION 'legacy support message attachment is not stored and allowed';
    END IF;
    IF NEW.content_type = 'IMAGE' AND attachment_mime_type NOT LIKE 'image/%' THEN
      RAISE EXCEPTION 'legacy image support message attachment is not an image';
    END IF;
    IF NEW.content_type = 'AUDIO' AND attachment_mime_type NOT LIKE 'audio/%' THEN
      RAISE EXCEPTION 'legacy audio support message attachment is not audio';
    END IF;
  END IF;

  IF NEW.quote_id IS NOT NULL THEN
    SELECT conversation_id, request_id INTO quote_conversation_id, quote_request_id
    FROM service_quotes
    WHERE id = NEW.quote_id;
    IF quote_conversation_id IS NULL
       OR quote_conversation_id <> NEW.conversation_id
       OR quote_request_id IS DISTINCT FROM NEW.request_id THEN
      RAISE EXCEPTION 'support message quote does not belong to its conversation and request';
    END IF;
  END IF;

  IF NEW.source_request_message_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM service_request_messages AS source_messages
    INNER JOIN service_request_conversations AS source_conversations
      ON source_conversations.id = source_messages.conversation_id
    WHERE source_messages.id = NEW.source_request_message_id
      AND source_conversations.request_id = NEW.request_id
      AND source_messages.sender_type = NEW.sender_type
      AND source_messages.sender_user_id IS NOT DISTINCT FROM NEW.sender_user_id
  ) THEN
    RAISE EXCEPTION 'support message legacy source does not match';
  END IF;

  IF NEW.source_request_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM service_request_events
    WHERE id = NEW.source_request_event_id AND request_id = NEW.request_id
  ) THEN
    RAISE EXCEPTION 'support message request event source does not match';
  END IF;

  RETURN NEW;
END;
$$;

CREATE FUNCTION touch_support_conversation_after_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE support_conversations
  SET updated_at = greatest(updated_at, created_at, NEW.sent_at),
      last_message_at = greatest(COALESCE(last_message_at, created_at), created_at, NEW.sent_at)
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_messages_touch_conversation
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION touch_support_conversation_after_message();

CREATE FUNCTION ensure_student_support_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role_code = 'STUDENT' THEN
    INSERT INTO support_conversations (student_user_id, created_by_user_id)
    SELECT users.id, users.id
    FROM users
    WHERE users.id = NEW.user_id AND users.status = 'ACTIVE'
    ON CONFLICT (student_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_roles_ensure_student_support_conversation
AFTER INSERT ON user_roles
FOR EACH ROW EXECUTE FUNCTION ensure_student_support_conversation();

CREATE FUNCTION ensure_activated_student_support_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE'
     AND EXISTS (
       SELECT 1 FROM user_roles
       WHERE user_id = NEW.id AND role_code = 'STUDENT'
     ) THEN
    INSERT INTO support_conversations (student_user_id, created_by_user_id)
    VALUES (NEW.id, NEW.id)
    ON CONFLICT (student_user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_ensure_activated_student_support_conversation
AFTER UPDATE OF status ON users
FOR EACH ROW EXECUTE FUNCTION ensure_activated_student_support_conversation();

-- Ensure every existing student has exactly one canonical conversation.
-- Backdate the canonical container to the earliest request-history timestamp.
-- This is required for upgrades: the migrated messages below may predate the
-- support conversation introduced by migration 016, while that table enforces
-- last_message_at >= created_at.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM service_requests
    INNER JOIN users ON users.id = service_requests.student_user_id
    WHERE users.status <> 'ACTIVE'
       OR NOT EXISTS (
         SELECT 1
         FROM user_roles
         WHERE user_roles.user_id = users.id
           AND user_roles.role_code = 'STUDENT'
       )
  ) THEN
    RAISE EXCEPTION
      'request owner is not an active student; review identity roles before migration 019 to avoid an incomplete unified conversation';
  END IF;
END;
$$;

WITH request_history AS (
  SELECT requests.student_user_id, requests.created_at AS occurred_at
  FROM service_requests AS requests
  UNION ALL
  SELECT requests.student_user_id, messages.sent_at
  FROM service_request_messages AS messages
  INNER JOIN service_request_conversations AS request_conversations
    ON request_conversations.id = messages.conversation_id
  INNER JOIN service_requests AS requests ON requests.id = request_conversations.request_id
  UNION ALL
  SELECT requests.student_user_id, events.created_at
  FROM service_request_events AS events
  INNER JOIN service_requests AS requests ON requests.id = events.request_id
), earliest_history AS (
  SELECT student_user_id, min(occurred_at) AS occurred_at
  FROM request_history
  GROUP BY student_user_id
)
INSERT INTO support_conversations (student_user_id, created_by_user_id, created_at)
SELECT users.id, users.id, COALESCE(earliest_history.occurred_at, now())
FROM users
INNER JOIN user_roles ON user_roles.user_id = users.id
LEFT JOIN earliest_history ON earliest_history.student_user_id = users.id
WHERE user_roles.role_code = 'STUDENT'
  AND users.status = 'ACTIVE'
ON CONFLICT (student_user_id) DO UPDATE
SET created_at = least(support_conversations.created_at, EXCLUDED.created_at);

-- Preserve human request-chat history, request linkage, attachments, client
-- idempotency keys, and original timestamps. System request history is copied
-- from the authoritative service_request_events ledger below to avoid duplicate
-- status cards produced by the legacy request-chat service.
INSERT INTO support_messages (
  conversation_id, sender_type, sender_user_id, content_type, body,
  legacy_request_attachment_id, client_message_id, client_payload_fingerprint, metadata,
  sent_at, request_id, source_request_message_id
)
SELECT
  support_conversations.id,
  request_messages.sender_type,
  request_messages.sender_user_id,
  request_messages.content_type,
  COALESCE(request_messages.body, attachments.original_filename, request_messages.content_type),
  request_messages.attachment_id,
  CASE
    WHEN request_messages.client_message_id IS NULL THEN NULL
    ELSE request_messages.id
  END,
  request_messages.client_payload_fingerprint,
  request_messages.metadata || jsonb_strip_nulls(jsonb_build_object(
    'legacyClientMessageId', request_messages.client_message_id
  )),
  request_messages.sent_at,
  request_conversations.request_id,
  request_messages.id
FROM service_request_messages AS request_messages
INNER JOIN service_request_conversations AS request_conversations
  ON request_conversations.id = request_messages.conversation_id
INNER JOIN service_requests AS requests ON requests.id = request_conversations.request_id
INNER JOIN support_conversations
  ON support_conversations.student_user_id = requests.student_user_id
LEFT JOIN service_request_attachments AS attachments
  ON attachments.id = request_messages.attachment_id
WHERE request_messages.sender_type IN ('STUDENT', 'ADMIN')
ON CONFLICT (source_request_message_id) WHERE source_request_message_id IS NOT NULL DO NOTHING;

INSERT INTO support_message_receipts (
  message_id, recipient_user_id, status, delivered_at, read_at, created_at, updated_at
)
SELECT
  unified_messages.id,
  request_receipts.recipient_user_id,
  request_receipts.status,
  request_receipts.delivered_at,
  request_receipts.read_at,
  request_receipts.created_at,
  request_receipts.updated_at
FROM service_request_message_receipts AS request_receipts
INNER JOIN support_messages AS unified_messages
  ON unified_messages.source_request_message_id = request_receipts.message_id
ON CONFLICT (message_id, recipient_user_id) DO NOTHING;

INSERT INTO support_messages (
  conversation_id, sender_type, sender_user_id, content_type, body, metadata,
  sent_at, request_id, source_request_event_id
)
SELECT
  support_conversations.id,
  'SYSTEM',
  NULL,
  CASE
    WHEN request_events.event_type IN (
      'REQUEST_CREATED', 'REQUEST_SUBMITTED', 'REQUEST_STATUS_CHANGED',
      'REQUEST_CANCELLED', 'SERVICE_QUOTE_CREATED', 'SERVICE_QUOTE_ACCEPTED',
      'SERVICE_QUOTE_REJECTED'
    ) THEN 'ACTION'
    ELSE 'SYSTEM'
  END,
  request_events.event_type,
  jsonb_strip_nulls(jsonb_build_object(
    'eventId', request_events.id::text,
    'eventType', request_events.event_type,
    'fromStatus', request_events.from_status,
    'toStatus', request_events.to_status,
    'requestVersion', request_events.request_version
  )),
  request_events.created_at,
  request_events.request_id,
  request_events.id
FROM service_request_events AS request_events
INNER JOIN service_requests AS requests ON requests.id = request_events.request_id
INNER JOIN support_conversations
  ON support_conversations.student_user_id = requests.student_user_id
ON CONFLICT (source_request_event_id) WHERE source_request_event_id IS NOT NULL DO NOTHING;

-- Migration-created status cards are historical context, not fresh alerts.
-- Mark them read for the student and all current administrators so deployment
-- never floods either inbox with old work.
INSERT INTO support_message_receipts (
  message_id, recipient_user_id, status, delivered_at, read_at
)
SELECT messages.id, participants.user_id, 'READ', now(), now()
FROM support_messages AS messages
INNER JOIN support_conversations AS conversations ON conversations.id = messages.conversation_id
CROSS JOIN LATERAL (
  SELECT conversations.student_user_id AS user_id
  UNION
  SELECT user_roles.user_id
  FROM user_roles
  WHERE user_roles.role_code = 'ADMIN'
) AS participants
WHERE messages.source_request_event_id IS NOT NULL
ON CONFLICT (message_id, recipient_user_id) DO NOTHING;

CREATE FUNCTION mirror_request_message_into_student_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_conversation_id UUID;
  canonical_request_id UUID;
  canonical_student_id UUID;
  attachment_filename TEXT;
  unified_message_id UUID;
  notification_recipient RECORD;
BEGIN
  IF NEW.sender_type = 'SYSTEM' THEN
    RETURN NEW;
  END IF;

  SELECT request_conversations.request_id, requests.student_user_id
    INTO canonical_request_id, canonical_student_id
  FROM service_request_conversations AS request_conversations
  INNER JOIN service_requests AS requests ON requests.id = request_conversations.request_id
  WHERE request_conversations.id = NEW.conversation_id;

  INSERT INTO support_conversations (student_user_id, created_by_user_id)
  VALUES (canonical_student_id, canonical_student_id)
  ON CONFLICT (student_user_id) DO NOTHING;

  SELECT id INTO canonical_conversation_id
  FROM support_conversations
  WHERE student_user_id = canonical_student_id;

  IF NEW.attachment_id IS NOT NULL THEN
    SELECT original_filename INTO attachment_filename
    FROM service_request_attachments
    WHERE id = NEW.attachment_id;
  END IF;

  INSERT INTO support_messages (
    conversation_id, sender_type, sender_user_id, content_type, body,
    legacy_request_attachment_id, client_message_id, client_payload_fingerprint, metadata,
    sent_at, request_id, source_request_message_id
  ) VALUES (
    canonical_conversation_id, NEW.sender_type, NEW.sender_user_id, NEW.content_type,
    COALESCE(NEW.body, attachment_filename, NEW.content_type), NEW.attachment_id,
    CASE WHEN NEW.client_message_id IS NULL THEN NULL ELSE NEW.id END,
    NEW.client_payload_fingerprint,
    NEW.metadata || jsonb_strip_nulls(jsonb_build_object(
      'legacyClientMessageId', NEW.client_message_id
    )),
    NEW.sent_at, canonical_request_id, NEW.id
  )
  ON CONFLICT (source_request_message_id) WHERE source_request_message_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO unified_message_id;

  IF unified_message_id IS NULL THEN
    SELECT id INTO unified_message_id
    FROM support_messages
    WHERE source_request_message_id = NEW.id;
  END IF;

  FOR notification_recipient IN
    SELECT canonical_student_id AS user_id
    WHERE NEW.sender_type = 'ADMIN'
    UNION ALL
    SELECT users.id AS user_id
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE NEW.sender_type = 'STUDENT'
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  LOOP
    INSERT INTO support_message_receipts (message_id, recipient_user_id, status)
    VALUES (unified_message_id, notification_recipient.user_id, 'SENT')
    ON CONFLICT (message_id, recipient_user_id) DO NOTHING;

  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_messages_mirror_unified
AFTER INSERT ON service_request_messages
FOR EACH ROW EXECUTE FUNCTION mirror_request_message_into_student_conversation();

CREATE FUNCTION mirror_request_message_receipt_into_student_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO support_message_receipts (
    message_id, recipient_user_id, status, delivered_at, read_at, created_at, updated_at
  )
  SELECT messages.id, NEW.recipient_user_id, NEW.status, NEW.delivered_at, NEW.read_at,
         NEW.created_at, NEW.updated_at
  FROM support_messages AS messages
  WHERE messages.source_request_message_id = NEW.message_id
  ON CONFLICT (message_id, recipient_user_id) DO UPDATE
  SET status = EXCLUDED.status,
      delivered_at = COALESCE(support_message_receipts.delivered_at, EXCLUDED.delivered_at),
      read_at = COALESCE(support_message_receipts.read_at, EXCLUDED.read_at),
      updated_at = greatest(support_message_receipts.updated_at, EXCLUDED.updated_at)
  WHERE CASE support_message_receipts.status
          WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3
        END < CASE EXCLUDED.status
          WHEN 'SENT' THEN 1 WHEN 'DELIVERED' THEN 2 ELSE 3
        END;
  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_message_receipts_mirror_unified
AFTER INSERT OR UPDATE ON service_request_message_receipts
FOR EACH ROW EXECUTE FUNCTION mirror_request_message_receipt_into_student_conversation();

CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (
    kind IN (
      'MESSAGE_RECEIVED', 'REQUEST_UPDATED', 'REQUEST_STATUS_UPDATED',
      'QUOTE_RECEIVED', 'QUOTE_ACCEPTED', 'QUOTE_REJECTED',
      'ACCOUNT_PENDING_APPROVAL', 'SYSTEM_ANNOUNCEMENT'
    )
  ),
  conversation_id UUID REFERENCES support_conversations(id) ON DELETE RESTRICT,
  request_id UUID REFERENCES service_requests(id) ON DELETE RESTRICT,
  message_id UUID REFERENCES support_messages(id) ON DELETE RESTRICT,
  quote_id UUID REFERENCES service_quotes(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 2 AND 160),
  title_en TEXT NOT NULL CHECK (char_length(btrim(title_en)) BETWEEN 2 AND 160),
  body_ar TEXT CHECK (body_ar IS NULL OR char_length(btrim(body_ar)) BETWEEN 1 AND 500),
  body_en TEXT CHECK (body_en IS NULL OR char_length(btrim(body_en)) BETWEEN 1 AND 500),
  action_href TEXT CHECK (
    action_href IS NULL
    OR (
      char_length(action_href) BETWEEN 1 AND 500
      AND action_href LIKE '/%'
      AND action_href NOT LIKE '//%'
      AND action_href !~ '[[:cntrl:]]'
    )
  ),
  idempotency_key TEXT NOT NULL UNIQUE
    CHECK (char_length(idempotency_key) BETWEEN 8 AND 240),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((body_ar IS NULL) = (body_en IS NULL)),
  CHECK (updated_at >= created_at),
  CHECK (read_at IS NULL OR read_at >= created_at)
);

CREATE INDEX user_notifications_recipient_unread_idx
  ON user_notifications (recipient_user_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;
CREATE INDEX user_notifications_recipient_created_idx
  ON user_notifications (recipient_user_id, created_at DESC, id DESC);
CREATE INDEX user_notifications_request_idx
  ON user_notifications (request_id, created_at DESC, id DESC)
  WHERE request_id IS NOT NULL;

CREATE FUNCTION guard_user_notification_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user notifications cannot be deleted';
  END IF;

  IF ROW(
    NEW.id, NEW.recipient_user_id, NEW.kind, NEW.conversation_id, NEW.request_id,
    NEW.message_id, NEW.quote_id, NEW.title_ar, NEW.title_en, NEW.body_ar,
    NEW.body_en, NEW.action_href, NEW.idempotency_key, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.id, OLD.recipient_user_id, OLD.kind, OLD.conversation_id, OLD.request_id,
    OLD.message_id, OLD.quote_id, OLD.title_ar, OLD.title_en, OLD.body_ar,
    OLD.body_en, OLD.action_href, OLD.idempotency_key, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'user notification content is immutable';
  END IF;

  IF OLD.read_at IS NOT NULL OR NEW.read_at IS NULL OR NEW.read_at < NEW.created_at THEN
    RAISE EXCEPTION 'user notification may only transition from unread to read';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_notifications_guard
BEFORE UPDATE OR DELETE ON user_notifications
FOR EACH ROW EXECUTE FUNCTION guard_user_notification_mutation();
CREATE TRIGGER user_notifications_reject_truncate
BEFORE TRUNCATE ON user_notifications
FOR EACH STATEMENT EXECUTE FUNCTION reject_service_quote_mutation();

CREATE FUNCTION enqueue_user_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO outbox_events (
    event_type, aggregate_type, aggregate_id, idempotency_key, payload
  ) VALUES (
    'USER_NOTIFICATION_CREATED', 'USER_NOTIFICATION', NEW.id,
    'user-notification:' || NEW.id::text,
    jsonb_build_object(
      'schemaVersion', 1,
      'notificationId', NEW.id,
      'recipientUserId', NEW.recipient_user_id,
      'kind', NEW.kind
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER user_notifications_enqueue_outbox
AFTER INSERT ON user_notifications
FOR EACH ROW EXECUTE FUNCTION enqueue_user_notification();

CREATE FUNCTION notify_human_support_message_recipient()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  conversation_student_id UUID;
  recipient RECORD;
BEGIN
  IF NEW.sender_type NOT IN ('STUDENT', 'ADMIN')
     OR NEW.content_type NOT IN ('TEXT', 'IMAGE', 'AUDIO', 'FILE') THEN
    RETURN NEW;
  END IF;

  SELECT student_user_id INTO conversation_student_id
  FROM support_conversations
  WHERE id = NEW.conversation_id;

  FOR recipient IN
    SELECT conversation_student_id AS user_id
    WHERE NEW.sender_type = 'ADMIN'
    UNION ALL
    SELECT users.id AS user_id
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE NEW.sender_type = 'STUDENT'
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  LOOP
    INSERT INTO user_notifications (
      recipient_user_id, kind, conversation_id, request_id, message_id,
      title_ar, title_en, body_ar, body_en, action_href, idempotency_key
    ) VALUES (
      recipient.user_id,
      'MESSAGE_RECEIVED',
      NEW.conversation_id,
      NEW.request_id,
      NEW.id,
      'رسالة جديدة',
      'New message',
      'لديك رسالة جديدة في محادثة الدعم.',
      'You have a new message in your support conversation.',
      '/conversation?conversation=' || NEW.conversation_id::text
        || CASE
          WHEN NEW.request_id IS NULL THEN ''
          ELSE '&request=' || NEW.request_id::text
        END,
      'support-message:' || NEW.id::text || ':recipient:' || recipient.user_id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER support_messages_notify_recipient
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION notify_human_support_message_recipient();

CREATE FUNCTION notify_administrators_of_pending_account()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  administrator RECORD;
BEGIN
  IF NEW.event_type <> 'ACCOUNT_REGISTRATION_CREATED' THEN
    RETURN NEW;
  END IF;

  FOR administrator IN
    SELECT users.id
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.status = 'ACTIVE' AND user_roles.role_code = 'ADMIN'
  LOOP
    INSERT INTO user_notifications (
      recipient_user_id, kind, title_ar, title_en, body_ar, body_en,
      action_href, idempotency_key
    ) VALUES (
      administrator.id,
      'ACCOUNT_PENDING_APPROVAL',
      'حساب جديد بانتظار الموافقة',
      'New account awaiting approval',
      'يوجد حساب طالب جديد يحتاج إلى مراجعة المدير.',
      'A new student account requires administrator review.',
      '/verifications',
      'account-registration:' || NEW.id::text || ':recipient:' || administrator.id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER outbox_events_notify_pending_account
AFTER INSERT ON outbox_events
FOR EACH ROW EXECUTE FUNCTION notify_administrators_of_pending_account();

CREATE FUNCTION project_request_event_into_student_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  canonical_conversation_id UUID;
  canonical_student_id UUID;
  canonical_request_number TEXT;
  unified_message_id UUID;
  notification_record RECORD;
  notification_kind TEXT;
BEGIN
  -- Quote actions are projected by ServiceQuoteService with their quote_id so
  -- the UI receives one actionable card instead of a duplicate generic event.
  IF NEW.event_type LIKE 'SERVICE_QUOTE_%' THEN
    RETURN NEW;
  END IF;

  SELECT student_user_id, request_number
    INTO canonical_student_id, canonical_request_number
  FROM service_requests
  WHERE id = NEW.request_id;

  INSERT INTO support_conversations (student_user_id, created_by_user_id)
  VALUES (canonical_student_id, canonical_student_id)
  ON CONFLICT (student_user_id) DO NOTHING;

  SELECT id INTO canonical_conversation_id
  FROM support_conversations
  WHERE student_user_id = canonical_student_id;

  INSERT INTO support_messages (
    conversation_id, sender_type, sender_user_id, content_type, body,
    metadata, sent_at, request_id, source_request_event_id
  ) VALUES (
    canonical_conversation_id, 'SYSTEM', NULL,
    CASE
      WHEN NEW.from_status IS NOT NULL OR NEW.event_type IN (
        'REQUEST_CREATED', 'REQUEST_SUBMITTED', 'SERVICE_QUOTE_CREATED',
        'SERVICE_QUOTE_ACCEPTED', 'SERVICE_QUOTE_REJECTED'
      ) THEN 'ACTION'
      ELSE 'SYSTEM'
    END,
    NEW.event_type,
    jsonb_strip_nulls(jsonb_build_object(
      'eventId', NEW.id::text,
      'eventType', NEW.event_type,
      'fromStatus', NEW.from_status,
      'toStatus', NEW.to_status,
      'requestVersion', NEW.request_version
    )),
    NEW.created_at, NEW.request_id, NEW.id
  )
  ON CONFLICT (source_request_event_id) WHERE source_request_event_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO unified_message_id;

  IF unified_message_id IS NULL THEN
    SELECT id INTO unified_message_id
    FROM support_messages
    WHERE source_request_event_id = NEW.id;
  END IF;

  notification_kind := CASE
    WHEN NEW.from_status IS NOT NULL THEN 'REQUEST_STATUS_UPDATED'
    ELSE 'REQUEST_UPDATED'
  END;

  FOR notification_record IN
    SELECT canonical_student_id AS recipient_user_id
    WHERE NEW.actor_type IN ('ADMIN', 'SYSTEM')
      AND NEW.actor_user_id IS DISTINCT FROM canonical_student_id
    UNION ALL
    SELECT users.id AS recipient_user_id
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE NEW.actor_type = 'STUDENT'
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  LOOP
    INSERT INTO support_message_receipts (message_id, recipient_user_id, status)
    VALUES (unified_message_id, notification_record.recipient_user_id, 'SENT')
    ON CONFLICT (message_id, recipient_user_id) DO NOTHING;

    INSERT INTO user_notifications (
      recipient_user_id, kind, conversation_id, request_id, message_id,
      title_ar, title_en, body_ar, body_en, action_href, idempotency_key
    ) VALUES (
      notification_record.recipient_user_id,
      notification_kind,
      canonical_conversation_id,
      NEW.request_id,
      unified_message_id,
      CASE WHEN NEW.from_status IS NOT NULL THEN 'تحديث حالة الطلب' ELSE 'تحديث على الطلب' END,
      CASE WHEN NEW.from_status IS NOT NULL THEN 'Request status updated' ELSE 'Request updated' END,
      'تم تحديث الطلب ' || canonical_request_number,
      'Request ' || canonical_request_number || ' was updated',
      '/conversation?conversation=' || canonical_conversation_id::text
        || '&request=' || NEW.request_id::text,
      'request-event:' || NEW.id::text || ':recipient:' || notification_record.recipient_user_id::text
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER service_request_events_project_unified
AFTER INSERT ON service_request_events
FOR EACH ROW EXECUTE FUNCTION project_request_event_into_student_conversation();

INSERT INTO permissions (code, description) VALUES
  ('conversations.read.own', 'Read the authenticated student unified conversation'),
  ('conversations.send.own', 'Send human messages in the authenticated student unified conversation'),
  ('admin.conversations.read', 'Read unified student conversations administratively'),
  ('admin.conversations.send', 'Send human messages in unified student conversations administratively'),
  ('quotes.respond.own', 'Accept or reject quotes for requests owned by the authenticated student'),
  ('admin.quotes.manage', 'Create and withdraw versioned service quotes administratively'),
  ('notifications.read.own', 'Read and acknowledge notifications addressed to the authenticated account')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'conversations.read.own'),
  ('STUDENT', 'conversations.send.own'),
  ('STUDENT', 'quotes.respond.own'),
  ('STUDENT', 'notifications.read.own'),
  ('ADMIN', 'admin.conversations.read'),
  ('ADMIN', 'admin.conversations.send'),
  ('ADMIN', 'admin.quotes.manage'),
  ('ADMIN', 'notifications.read.own'),
  ('SYSTEM', 'admin.conversations.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Migration 014 grants broad bounded access to future tables. Retain only the
-- mutations used by services and protect immutable content at the role layer.
DO $runtime_unified_conversation_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE DELETE ON TABLE service_quotes, user_notifications FROM itqanak_runtime;
  REVOKE UPDATE, DELETE ON TABLE service_quote_finance_dues FROM itqanak_runtime;
  REVOKE UPDATE, DELETE ON TABLE support_messages FROM itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE support_messages TO itqanak_runtime;
  GRANT SELECT, INSERT, UPDATE ON TABLE service_quotes, user_notifications TO itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE service_quote_finance_dues TO itqanak_runtime;
END;
$runtime_unified_conversation_privileges$;
