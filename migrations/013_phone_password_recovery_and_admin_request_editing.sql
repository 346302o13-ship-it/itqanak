-- Phone-first password recovery reviewed by an administrator after the
-- student contacts support from the registered WhatsApp number. Raw reset
-- tokens and passwords are never stored in this table.
-- This migration is forward-only. Do not edit after it is applied.

CREATE TABLE phone_password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  phone_e164 TEXT NOT NULL,
  public_reference TEXT NOT NULL UNIQUE
    CHECK (public_reference ~ '^PR-[A-F0-9]{10}$'),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'LINK_EXPIRED', 'COMPLETED')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  whatsapp_reference TEXT,
  review_note TEXT,
  password_reset_token_id UUID UNIQUE REFERENCES password_reset_tokens(id) ON DELETE RESTRICT,
  completed_at TIMESTAMPTZ,
  CHECK (expires_at > requested_at),
  CHECK (
    (status = 'PENDING'
      AND reviewed_at IS NULL
      AND reviewed_by_user_id IS NULL
      AND whatsapp_reference IS NULL
      AND review_note IS NULL
      AND password_reset_token_id IS NULL
      AND completed_at IS NULL)
    OR (status = 'APPROVED'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND whatsapp_reference IS NOT NULL
      AND password_reset_token_id IS NOT NULL
      AND completed_at IS NULL)
    OR (status = 'REJECTED'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND whatsapp_reference IS NULL
      AND review_note IS NOT NULL
      AND password_reset_token_id IS NULL
      AND completed_at IS NULL)
    OR (status = 'EXPIRED'
      AND reviewed_at IS NULL
      AND reviewed_by_user_id IS NULL
      AND whatsapp_reference IS NULL
      AND review_note IS NULL
      AND password_reset_token_id IS NULL
      AND completed_at IS NULL)
    OR (status = 'LINK_EXPIRED'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND whatsapp_reference IS NOT NULL
      AND password_reset_token_id IS NULL
      AND completed_at IS NULL)
    OR (status = 'COMPLETED'
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
      AND whatsapp_reference IS NOT NULL
      AND password_reset_token_id IS NULL
      AND completed_at IS NOT NULL)
  ),
  CHECK (reviewed_at IS NULL OR reviewed_at >= requested_at),
  CHECK (completed_at IS NULL OR (reviewed_at IS NOT NULL AND completed_at >= reviewed_at)),
  CHECK (
    whatsapp_reference IS NULL
    OR whatsapp_reference ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$'
  ),
  CHECK (review_note IS NULL OR char_length(btrim(review_note)) BETWEEN 3 AND 1000)
);

CREATE INDEX phone_password_reset_requests_pending_idx
  ON phone_password_reset_requests (requested_at, id)
  WHERE status = 'PENDING';
CREATE INDEX phone_password_reset_requests_user_idx
  ON phone_password_reset_requests (user_id, requested_at DESC, id DESC);

INSERT INTO permissions (code, description) VALUES
  ('admin.passwordresets.read', 'Read phone-first password recovery requests'),
  ('admin.passwordresets.manage', 'Approve or reject phone-first password recovery requests')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('ADMIN', 'admin.passwordresets.read'),
  ('ADMIN', 'admin.passwordresets.manage'),
  ('SYSTEM', 'admin.passwordresets.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;
