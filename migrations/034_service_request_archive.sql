-- Stale pending requests (DRAFT / SUBMITTED / UNDER_REVIEW / QUOTED that have
-- gone idle) can be archived by an administrator to clear the review queue.
--
-- Archiving is a fully reversible soft state: the request row and every related
-- record (conversation, events, attachments) stay exactly as they are. An
-- archived request is simply hidden from the admin request inbox, the student
-- dashboard/list and the stale-pending review, and can be restored at any time.
-- Requests that carry a financial due are never archivable -- that data is kept
-- permanently and stays fully visible.

ALTER TABLE service_requests
  ADD COLUMN archived_at TIMESTAMPTZ,
  ADD COLUMN archived_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN archive_reason TEXT
    CHECK (archive_reason IS NULL OR char_length(btrim(archive_reason)) BETWEEN 1 AND 500);

-- archived_at and archived_by_user_id are set and cleared together. (A later
-- ON DELETE SET NULL on the actor could momentarily break this pairing, so the
-- check tolerates a null actor with a non-null timestamp.)
ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_archive_reason_requires_archived_check
  CHECK (archive_reason IS NULL OR archived_at IS NOT NULL);

CREATE INDEX service_requests_archived_idx
  ON service_requests (archived_at DESC, id)
  WHERE archived_at IS NOT NULL;

INSERT INTO permissions (code, description) VALUES
  ('admin.requests.archive', 'Archive and restore stale pending service requests')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('ADMIN', 'admin.requests.archive'),
  ('SYSTEM', 'admin.requests.archive')
ON CONFLICT (role_code, permission_code) DO NOTHING;
