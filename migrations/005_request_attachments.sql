-- Phase 3 private request-attachment metadata and malware-scan lifecycle.
-- Object bytes stay outside PostgreSQL. Storage and scan states are separate
-- because the object store cannot participate in a database transaction.
-- This migration is forward-only. Do not edit after it is applied.

CREATE TABLE service_request_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  storage_provider TEXT NOT NULL CHECK (storage_provider IN ('local', 's3')),
  storage_bucket TEXT
    CHECK (storage_bucket IS NULL OR char_length(storage_bucket) BETWEEN 3 AND 255),
  storage_key TEXT
    CHECK (
      storage_key IS NULL
      OR (
        char_length(storage_key) BETWEEN 20 AND 1024
        AND storage_key NOT LIKE '/%'
        AND storage_key NOT LIKE '%..%'
        AND position(chr(92) IN storage_key) = 0
      )
    ),
  original_filename TEXT NOT NULL
    CHECK (
      char_length(btrim(original_filename)) BETWEEN 1 AND 255
      AND original_filename !~ '[\\/]'
      AND original_filename !~ '[[:cntrl:]]'
    ),
  normalized_extension TEXT NOT NULL
    CHECK (normalized_extension IN ('.pdf', '.docx', '.pptx', '.xlsx', '.txt', '.png', '.jpg', '.jpeg')),
  detected_mime_type TEXT
    CHECK (detected_mime_type IS NULL OR char_length(detected_mime_type) BETWEEN 3 AND 160),
  declared_mime_type TEXT NOT NULL
    CHECK (char_length(declared_mime_type) BETWEEN 3 AND 160),
  size_bytes BIGINT NOT NULL CHECK (size_bytes BETWEEN 1 AND 104857600),
  sha256 CHAR(64) CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  storage_status TEXT NOT NULL DEFAULT 'PENDING_UPLOAD'
    CHECK (
      storage_status IN ('PENDING_UPLOAD', 'STORED', 'DELETE_PENDING', 'DELETED', 'UPLOAD_FAILED')
    ),
  scan_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'
    CHECK (
      scan_status IN (
        'PENDING_SCAN',
        'CLEAN',
        'INFECTED',
        'SCAN_ERROR',
        'SCAN_SKIPPED_DEVELOPMENT',
        'NOT_REQUIRED',
        'REJECTED'
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
    OR storage_key LIKE 'requests/' || request_id::TEXT || '/' || id::TEXT || '/%'
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
      AND storage_key IS NOT NULL
      AND sha256 IS NOT NULL
      AND detected_mime_type IS NOT NULL
    )
  ),
  CHECK (
    scan_status NOT IN ('CLEAN', 'INFECTED', 'SCAN_ERROR', 'SCAN_SKIPPED_DEVELOPMENT', 'REJECTED')
    OR scan_completed_at IS NOT NULL
  ),
  CHECK (scan_threat_name IS NULL OR scan_status = 'INFECTED'),
  CHECK (scan_started_at IS NULL OR scan_started_at >= created_at),
  CHECK (scan_completed_at IS NULL OR scan_completed_at >= created_at),
  CHECK (
    scan_started_at IS NULL
    OR scan_completed_at IS NULL
    OR scan_completed_at >= scan_started_at
  ),
  CHECK (updated_at >= created_at),
  CHECK (deleted_at IS NULL OR deleted_at >= created_at),
  CHECK (
    deleted_at IS NULL
    OR storage_status IN ('DELETE_PENDING', 'DELETED')
  )
);

CREATE UNIQUE INDEX service_request_attachments_object_key_unique
  ON service_request_attachments (
    storage_provider,
    COALESCE(storage_bucket, ''),
    storage_key
  )
  WHERE storage_key IS NOT NULL;
CREATE INDEX service_request_attachments_request_created_idx
  ON service_request_attachments (request_id, created_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX service_request_attachments_scan_created_idx
  ON service_request_attachments (scan_status, created_at, id)
  WHERE deleted_at IS NULL;
CREATE INDEX service_request_attachments_scan_delivery_idx
  ON service_request_attachments (scan_status, scan_next_attempt_at, created_at, id)
  WHERE deleted_at IS NULL AND storage_status = 'STORED';

INSERT INTO permissions (code, description) VALUES
  ('requests.attachments.create.own', 'Upload attachments to an eligible owned service request'),
  ('requests.attachments.read.own', 'Read clean attachments from an owned service request'),
  ('requests.attachments.delete.own', 'Soft-delete attachments from an eligible owned service request')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'requests.attachments.create.own'),
  ('STUDENT', 'requests.attachments.read.own'),
  ('STUDENT', 'requests.attachments.delete.own')
ON CONFLICT (role_code, permission_code) DO NOTHING;
