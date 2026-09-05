-- Lets the administration attach an image to a group-channel post (a screenshot
-- of a new feature, a schedule, a poster). Images only, one per message, and —
-- unlike the async unified-conversation pipeline — scanned synchronously in the
-- upload route so only a CLEAN file is ever written to object storage. This
-- migration is forward-only.

ALTER TABLE group_channel_messages
  DROP CONSTRAINT group_channel_messages_content_type_check;
ALTER TABLE group_channel_messages
  ADD CONSTRAINT group_channel_messages_content_type_check
    CHECK (content_type IN ('TEXT', 'IMAGE', 'SYSTEM'));

ALTER TABLE group_channel_messages
  DROP CONSTRAINT group_channel_messages_check;
ALTER TABLE group_channel_messages
  ADD CONSTRAINT group_channel_messages_check
    CHECK (
      (sender_type = 'SYSTEM' AND sender_user_id IS NULL AND content_type = 'SYSTEM')
      OR (
        sender_type IN ('ADMIN', 'STUDENT')
        AND sender_user_id IS NOT NULL
        AND content_type IN ('TEXT', 'IMAGE')
      )
    );

CREATE TABLE group_channel_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL UNIQUE REFERENCES group_channel_messages (id) ON DELETE CASCADE,
  uploaded_by_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('local', 's3')),
  storage_bucket TEXT
    CHECK (storage_bucket IS NULL OR char_length(storage_bucket) BETWEEN 3 AND 255),
  storage_key TEXT NOT NULL CHECK (
    char_length(storage_key) BETWEEN 20 AND 1024
    AND storage_key NOT LIKE '/%'
    AND storage_key NOT LIKE '%..%'
    AND position(chr(92) IN storage_key) = 0
  ),
  original_filename TEXT NOT NULL CHECK (
    char_length(btrim(original_filename)) BETWEEN 1 AND 255
    AND original_filename !~ '[\\/]'
    AND original_filename !~ '[[:cntrl:]]'
  ),
  normalized_extension TEXT NOT NULL
    CHECK (normalized_extension IN ('.png', '.jpg', '.webp', '.gif')),
  detected_mime_type TEXT NOT NULL
    CHECK (char_length(detected_mime_type) BETWEEN 3 AND 160),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 26214400),
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  scan_status TEXT NOT NULL CHECK (scan_status IN ('CLEAN', 'SCAN_SKIPPED_DEVELOPMENT')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (storage_provider = 'local' AND storage_bucket IS NULL)
    OR (storage_provider = 's3' AND storage_bucket IS NOT NULL)
  ),
  CHECK (
    storage_key LIKE 'group-channel/' || message_id::text || '/' || id::text || '/%'
  )
);

CREATE UNIQUE INDEX group_channel_attachments_object_key_unique
  ON group_channel_attachments (storage_provider, COALESCE(storage_bucket, ''), storage_key);

DO $group_channel_attachments_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;
  REVOKE UPDATE, DELETE ON TABLE group_channel_attachments FROM itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE group_channel_attachments TO itqanak_runtime;
END;
$group_channel_attachments_privileges$;
