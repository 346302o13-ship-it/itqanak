-- Allow deliberately unscanned attachments while ClamAV is disabled by the
-- administrator. This state is intentionally distinct from CLEAN and from the
-- development-only scanner stub. ClamAV remains disabled by default after this
-- migration; enabling it affects only uploads finalized after that change.

ALTER TABLE service_request_attachments
  DROP CONSTRAINT service_request_attachments_scan_status_check;

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_scan_status_check
  CHECK (
    scan_status IN (
      'PENDING_SCAN',
      'CLEAN',
      'INFECTED',
      'SCAN_ERROR',
      'SCAN_SKIPPED_DEVELOPMENT',
      'SCAN_SKIPPED_BY_ADMIN',
      'NOT_REQUIRED',
      'REJECTED'
    )
  );

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_admin_skip_completed_check
  CHECK (scan_status <> 'SCAN_SKIPPED_BY_ADMIN' OR scan_completed_at IS NOT NULL);

ALTER TABLE unified_conversation_attachments
  DROP CONSTRAINT unified_conversation_attachments_scan_status_check;

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_scan_status_check
  CHECK (
    scan_status IN (
      'PENDING_SCAN',
      'CLEAN',
      'INFECTED',
      'SCAN_ERROR',
      'SCAN_SKIPPED_DEVELOPMENT',
      'SCAN_SKIPPED_BY_ADMIN',
      'NOT_REQUIRED',
      'REJECTED'
    )
  );

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_admin_skip_completed_check
  CHECK (scan_status <> 'SCAN_SKIPPED_BY_ADMIN' OR scan_completed_at IS NOT NULL);

-- Both accepted JPEG filename spellings are persisted under one canonical
-- extension. Raw archives and M4A remain outside the upload policy.
UPDATE service_request_attachments
SET normalized_extension = '.jpg', updated_at = greatest(updated_at, now())
WHERE normalized_extension = '.jpeg';

-- Fail closed with an operator-readable preflight error instead of letting a
-- later ALTER TABLE emit an opaque constraint violation. Historical formats
-- outside this policy must be reviewed and remediated explicitly; they are
-- never silently relabelled as safe.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM service_request_attachments
    WHERE normalized_extension NOT IN (
      '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg',
      '.webm', '.ogg', '.mp3', '.wav'
    )
      OR declared_mime_type NOT IN (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain', 'image/png', 'image/jpeg',
        'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
      )
      OR (
        detected_mime_type IS NOT NULL
        AND detected_mime_type NOT IN (
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain', 'image/png', 'image/jpeg',
          'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
        )
      )
  ) THEN
    RAISE EXCEPTION
      'legacy attachment metadata is outside upload policy; run the documented preflight and remediate before migration 020';
  END IF;
END;
$$;

ALTER TABLE service_request_attachments
  DROP CONSTRAINT service_request_attachments_normalized_extension_check;

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_normalized_extension_check
  CHECK (
    normalized_extension IN (
      '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg',
      '.webm', '.ogg', '.mp3', '.wav'
    )
  );

ALTER TABLE unified_conversation_attachments
  DROP CONSTRAINT unified_conversation_attachments_normalized_extension_check;

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_normalized_extension_check
  CHECK (
    normalized_extension IN (
      '.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg',
      '.webm', '.ogg', '.mp3', '.wav'
    )
  );

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_declared_mime_allowlist_check
  CHECK (
    declared_mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'image/png', 'image/jpeg',
      'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
    )
  );

ALTER TABLE service_request_attachments
  ADD CONSTRAINT service_request_attachments_detected_mime_allowlist_check
  CHECK (
    detected_mime_type IS NULL OR detected_mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'image/png', 'image/jpeg',
      'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
    )
  );

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_declared_mime_allowlist_check
  CHECK (
    declared_mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'image/png', 'image/jpeg',
      'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
    )
  );

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_detected_mime_allowlist_check
  CHECK (
    detected_mime_type IS NULL OR detected_mime_type IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain', 'image/png', 'image/jpeg',
      'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/wav'
    )
  );

ALTER TABLE platform_operational_settings
  ALTER COLUMN file_scan_queue_paused SET DEFAULT true;

-- The singleton guard normally requires an active administrator for desired
-- state changes. A forward migration has no user actor, so disable only that
-- guard for this one deterministic default transition. The AFTER audit trigger
-- remains enabled and records the versioned system transition with a NULL
-- actor. The append-only event ledger therefore still records the change.
ALTER TABLE platform_operational_settings
  DISABLE TRIGGER platform_operational_settings_guard;

UPDATE platform_operational_settings
SET
  file_scan_queue_paused = true,
  version = version + 1,
  updated_by_user_id = NULL,
  updated_at = now()
WHERE singleton_key = 'platform'
  AND file_scan_queue_paused = false;

ALTER TABLE platform_operational_settings
  ENABLE TRIGGER platform_operational_settings_guard;

-- Keep the legacy per-request chat guard aligned during the transition to the
-- unified conversation. A skipped result is deliverable provenance, not a
-- clean scan result, and remains visible to every consumer.
CREATE OR REPLACE FUNCTION validate_service_request_message()
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
    IF attachment_storage_status <> 'STORED'
       OR attachment_scan_status NOT IN (
         'CLEAN', 'SCAN_SKIPPED_DEVELOPMENT', 'SCAN_SKIPPED_BY_ADMIN'
       ) THEN
      RAISE EXCEPTION 'message attachment is not stored and allowed';
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

-- Migration 019's database guard is the final authority for both unified and
-- mirrored legacy chat writes. Keep it aligned with the application policy:
-- an explicit administrator bypass may be sent, but is never relabelled CLEAN.
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
           attachment_storage_status, attachment_scan_status, attachment_mime_type
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
       OR attachment_scan_status NOT IN (
         'CLEAN', 'SCAN_SKIPPED_DEVELOPMENT', 'SCAN_SKIPPED_BY_ADMIN'
       ) THEN
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
       OR attachment_scan_status NOT IN (
         'CLEAN', 'SCAN_SKIPPED_DEVELOPMENT', 'SCAN_SKIPPED_BY_ADMIN'
       ) THEN
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
