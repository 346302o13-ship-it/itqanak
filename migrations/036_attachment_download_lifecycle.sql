-- Option-B retention for conversation attachments.
--
-- A stored conversation file is kept until the recipient (anyone other than the
-- uploader) downloads it; from that point it is kept for one more day
-- (configurable) and then its object is purged -- the row flips to EXPIRED and
-- keeps the file name, exactly like the previous time-based sweep. A file that
-- is never downloaded is purged after the "undownloaded" window (default 30d).
-- Payment-receipt attachments are financial records and are still never swept.

ALTER TABLE unified_conversation_attachments
  ADD COLUMN download_count INTEGER NOT NULL DEFAULT 0
    CHECK (download_count >= 0),
  ADD COLUMN last_downloaded_at TIMESTAMPTZ,
  ADD COLUMN delete_after TIMESTAMPTZ;

ALTER TABLE unified_conversation_attachments
  ADD CONSTRAINT unified_conversation_attachments_download_consistency_check
  CHECK (
    (download_count = 0 AND last_downloaded_at IS NULL AND delete_after IS NULL)
    OR (download_count > 0 AND last_downloaded_at IS NOT NULL AND delete_after IS NOT NULL)
  );

-- Sweep candidates once a post-download deadline exists.
CREATE INDEX unified_conversation_attachments_delete_after_idx
  ON unified_conversation_attachments (delete_after)
  WHERE deleted_at IS NULL AND storage_status = 'STORED' AND delete_after IS NOT NULL;

CREATE TABLE unified_attachment_downloads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachment_id UUID NOT NULL
    REFERENCES unified_conversation_attachments (id) ON DELETE CASCADE,
  downloader_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  downloaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX unified_attachment_downloads_attachment_idx
  ON unified_attachment_downloads (attachment_id, downloaded_at DESC);

ALTER TABLE platform_retention_settings
  ADD COLUMN attachment_undownloaded_retention_days INTEGER NOT NULL DEFAULT 30
    CHECK (attachment_undownloaded_retention_days BETWEEN 1 AND 3650),
  ADD COLUMN attachment_downloaded_retention_days INTEGER NOT NULL DEFAULT 1
    CHECK (attachment_downloaded_retention_days BETWEEN 1 AND 3650);

DO $runtime_attachment_lifecycle_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  -- Download audit rows are append-only.
  REVOKE UPDATE, DELETE ON TABLE unified_attachment_downloads FROM itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE unified_attachment_downloads TO itqanak_runtime;
END;
$runtime_attachment_lifecycle_privileges$;
