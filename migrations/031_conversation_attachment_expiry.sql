-- Conversation attachments are purged from object storage a few days after
-- upload to keep storage small. The row stays so the chat still shows the
-- file name; the object is gone and downloads return "no longer available".
--
-- New terminal storage_status 'EXPIRED': deleted_at stays NULL (so the row is
-- still joined into the conversation view), storage_key / sha256 /
-- detected_mime_type are kept for audit.

ALTER TABLE unified_conversation_attachments
  DROP CONSTRAINT unified_conversation_attachments_storage_status_check;
ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_storage_status_check
  CHECK (
    storage_status IN (
      'PENDING_UPLOAD', 'STORED', 'DELETE_PENDING', 'DELETED', 'UPLOAD_FAILED', 'EXPIRED'
    )
  );

-- check4: an attachment that was ever scanned must keep its object identity.
-- 'EXPIRED' rows still carry storage_key / sha256 / detected_mime_type, so
-- extend the allowed status list rather than weaken the columns.
ALTER TABLE unified_conversation_attachments
  DROP CONSTRAINT unified_conversation_attachments_check4;
ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_check4
  CHECK (
    scan_status = 'NOT_REQUIRED'
    OR (
      storage_status IN ('STORED', 'DELETE_PENDING', 'DELETED', 'EXPIRED')
      AND storage_key IS NOT NULL
      AND sha256 IS NOT NULL
      AND detected_mime_type IS NOT NULL
    )
  );

CREATE INDEX unified_conversation_attachments_retention_idx
  ON unified_conversation_attachments (created_at, id)
  WHERE deleted_at IS NULL AND storage_status = 'STORED';
