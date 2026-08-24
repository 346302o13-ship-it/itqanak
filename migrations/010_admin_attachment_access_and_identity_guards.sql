-- Administrative chat attachments and final identity/message invariants.
-- This migration is forward-only. Do not edit after it is applied.

ALTER TABLE users
  ADD CONSTRAINT users_identity_present_check
    CHECK (email_normalized IS NOT NULL OR phone_e164 IS NOT NULL);

CREATE UNIQUE INDEX service_request_messages_attachment_unique
  ON service_request_messages (attachment_id)
  WHERE attachment_id IS NOT NULL;

-- Every request conversation accepts protected chat media, even when the
-- underlying service itself does not require source files.
UPDATE services
SET accepts_files = TRUE,
    max_files = 10,
    max_file_size_bytes = 20971520,
    updated_at = now()
WHERE accepts_files = FALSE;

INSERT INTO permissions (code, description) VALUES
  ('admin.requests.attachments.create', 'Upload private attachments to administratively visible requests'),
  ('admin.requests.attachments.read', 'Download clean private attachments from administratively visible requests')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('ADMIN', 'admin.requests.attachments.create'),
  ('ADMIN', 'admin.requests.attachments.read'),
  ('SYSTEM', 'admin.requests.attachments.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;
