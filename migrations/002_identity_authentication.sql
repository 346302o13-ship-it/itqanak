-- Phase 2 identity, authentication, authorization, and durable auth-email work.
-- This migration is forward-only. Do not edit after it is applied.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL CHECK (char_length(email) BETWEEN 3 AND 320),
  email_normalized TEXT NOT NULL UNIQUE CHECK (char_length(email_normalized) BETWEEN 3 AND 320),
  display_name TEXT NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  status TEXT NOT NULL CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'DISABLED')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  disabled_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  CHECK (
    (status = 'PENDING_VERIFICATION' AND email_verified_at IS NULL)
    OR (status IN ('ACTIVE', 'SUSPENDED', 'DISABLED') AND email_verified_at IS NOT NULL)
  )
);

CREATE INDEX users_status_created_idx ON users (status, created_at DESC);

CREATE TABLE user_credentials (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL CHECK (char_length(password_hash) >= 32),
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  code TEXT PRIMARY KEY CHECK (code IN ('STUDENT', 'ADMIN', 'SYSTEM')),
  description TEXT NOT NULL
);

CREATE TABLE permissions (
  code TEXT PRIMARY KEY CHECK (code ~ '^[a-z]+(\.[a-z]+)+$'),
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE RESTRICT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  granted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, role_code)
);

CREATE INDEX user_roles_role_user_idx ON user_roles (role_code, user_id);

INSERT INTO roles (code, description) VALUES
  ('STUDENT', 'Default role granted to public registrations'),
  ('ADMIN', 'Administrative role granted only by an operator'),
  ('SYSTEM', 'Internal non-browser role')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (code, description) VALUES
  ('account.profile.read', 'Read the authenticated account profile'),
  ('account.profile.update', 'Update the authenticated account profile'),
  ('account.sessions.read', 'Read the authenticated account sessions'),
  ('account.sessions.revoke', 'Revoke the authenticated account sessions'),
  ('admin.dashboard.view', 'View the administrative dashboard'),
  ('admin.users.read', 'Read user administration data'),
  ('admin.users.manage', 'Manage users administratively'),
  ('admin.audit.read', 'Read security audit events')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'account.profile.read'),
  ('STUDENT', 'account.profile.update'),
  ('STUDENT', 'account.sessions.read'),
  ('STUDENT', 'account.sessions.revoke'),
  ('ADMIN', 'account.profile.read'),
  ('ADMIN', 'account.profile.update'),
  ('ADMIN', 'account.sessions.read'),
  ('ADMIN', 'account.sessions.revoke'),
  ('ADMIN', 'admin.dashboard.view'),
  ('ADMIN', 'admin.users.read'),
  ('ADMIN', 'admin.users.manage'),
  ('ADMIN', 'admin.audit.read'),
  ('SYSTEM', 'admin.dashboard.view'),
  ('SYSTEM', 'admin.users.read'),
  ('SYSTEM', 'admin.users.manage'),
  ('SYSTEM', 'admin.audit.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;

CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selector CHAR(32) NOT NULL UNIQUE,
  validator_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  idle_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  user_agent_summary TEXT,
  ip_hash CHAR(64),
  created_by_session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  CHECK (expires_at > created_at),
  CHECK (idle_expires_at > created_at)
);

CREATE INDEX user_sessions_active_user_idx
  ON user_sessions (user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_expiry_idx ON user_sessions (expires_at, idle_expires_at);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selector CHAR(32) NOT NULL UNIQUE,
  validator_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);

CREATE INDEX email_verification_tokens_active_user_idx
  ON email_verification_tokens (user_id, created_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  selector CHAR(32) NOT NULL UNIQUE,
  validator_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CHECK (expires_at > created_at)
);

CREATE INDEX password_reset_tokens_active_user_idx
  ON password_reset_tokens (user_id, created_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

CREATE TABLE legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN ('TERMS', 'PRIVACY')),
  version TEXT NOT NULL CHECK (char_length(version) BETWEEN 1 AND 64),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, document_type, version)
);

CREATE TABLE security_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 120),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES user_sessions(id) ON DELETE SET NULL,
  request_id TEXT,
  correlation_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE', 'DENIED')),
  ip_hash CHAR(64),
  user_agent_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX security_audit_events_target_occurred_idx
  ON security_audit_events (target_user_id, occurred_at DESC);
CREATE INDEX security_audit_events_event_occurred_idx
  ON security_audit_events (event_type, occurred_at DESC);

CREATE TABLE auth_email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_kind TEXT NOT NULL CHECK (email_kind IN ('VERIFY_EMAIL', 'PASSWORD_RESET', 'PASSWORD_CHANGED')),
  recipient_email TEXT NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 320),
  idempotency_key TEXT NOT NULL UNIQUE,
  encrypted_payload TEXT,
  payload_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD', 'SKIPPED_TEST')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  sent_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX auth_email_outbox_delivery_idx
  ON auth_email_outbox (status, available_at, created_at);
