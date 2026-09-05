-- One platform-wide group conversation shared by every active student and the
-- administration. Only administrators may post by default; flipping
-- members_can_post opens it to students. A student author is never shown to
-- other students (the UI labels them generically) — the real sender_user_id is
-- still recorded for moderation and audit. This migration is forward-only.

CREATE TABLE group_channel_settings (
  singleton_key TEXT PRIMARY KEY DEFAULT 'group' CHECK (singleton_key = 'group'),
  members_can_post BOOLEAN NOT NULL DEFAULT false,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

INSERT INTO group_channel_settings (singleton_key) VALUES ('group');

CREATE FUNCTION enforce_group_channel_settings_singleton()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'group channel settings cannot be truncated';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'group channel settings row cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM group_channel_settings) THEN
    RAISE EXCEPTION 'group channel settings is a singleton';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.singleton_key := 'group';
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_channel_settings_guard
BEFORE INSERT OR UPDATE OR DELETE ON group_channel_settings
FOR EACH ROW EXECUTE FUNCTION enforce_group_channel_settings_singleton();

CREATE TRIGGER group_channel_settings_reject_truncate
BEFORE TRUNCATE ON group_channel_settings
FOR EACH STATEMENT EXECUTE FUNCTION enforce_group_channel_settings_singleton();

CREATE TABLE group_channel_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('ADMIN', 'STUDENT', 'SYSTEM')),
  sender_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('TEXT', 'SYSTEM')),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 10000),
  deleted_at TIMESTAMPTZ,
  deleted_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  client_message_id UUID,
  client_payload_fingerprint CHAR(64)
    CHECK (client_payload_fingerprint IS NULL OR client_payload_fingerprint ~ '^[0-9a-f]{64}$'),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (sender_type = 'SYSTEM' AND sender_user_id IS NULL AND content_type = 'SYSTEM')
    OR (sender_type IN ('ADMIN', 'STUDENT') AND sender_user_id IS NOT NULL AND content_type = 'TEXT')
  ),
  CHECK ((client_message_id IS NULL) = (client_payload_fingerprint IS NULL)),
  CHECK (deleted_at IS NULL OR deleted_at >= sent_at),
  CHECK ((deleted_at IS NULL) = (deleted_by_user_id IS NULL))
);

CREATE UNIQUE INDEX group_channel_messages_client_id_unique
  ON group_channel_messages (sender_user_id, client_message_id)
  WHERE sender_user_id IS NOT NULL AND client_message_id IS NOT NULL;

CREATE INDEX group_channel_messages_sent_idx
  ON group_channel_messages (sent_at DESC, id DESC);

CREATE INDEX group_channel_messages_live_idx
  ON group_channel_messages (sent_at, id)
  WHERE deleted_at IS NULL;

CREATE FUNCTION validate_group_channel_message_sender()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.sender_type = 'ADMIN' AND NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.sender_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'group channel message sender is not an active administrator';
  END IF;

  IF NEW.sender_type = 'STUDENT' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.id = NEW.sender_user_id
        AND users.status = 'ACTIVE'
        AND user_roles.role_code = 'STUDENT'
    ) THEN
      RAISE EXCEPTION 'group channel message sender is not an active student';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM group_channel_settings
      WHERE singleton_key = 'group' AND members_can_post
    ) THEN
      RAISE EXCEPTION 'group channel is not open for student posting';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER group_channel_messages_validate_sender
BEFORE INSERT ON group_channel_messages
FOR EACH ROW EXECUTE FUNCTION validate_group_channel_message_sender();

CREATE FUNCTION guard_group_channel_message_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'group channel messages cannot be hard-deleted';
  END IF;
  IF OLD.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'group channel message is already deleted';
  END IF;
  IF NEW.deleted_at IS NULL OR NEW.deleted_by_user_id IS NULL THEN
    RAISE EXCEPTION 'group channel message update may only apply a soft delete';
  END IF;
  IF ROW (
    NEW.id, NEW.sender_type, NEW.sender_user_id, NEW.content_type, NEW.body,
    NEW.client_message_id, NEW.client_payload_fingerprint, NEW.metadata, NEW.sent_at
  ) IS DISTINCT FROM ROW (
    OLD.id, OLD.sender_type, OLD.sender_user_id, OLD.content_type, OLD.body,
    OLD.client_message_id, OLD.client_payload_fingerprint, OLD.metadata, OLD.sent_at
  ) THEN
    RAISE EXCEPTION 'group channel message update may only apply a soft delete';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER group_channel_messages_guard_update
BEFORE UPDATE OR DELETE ON group_channel_messages
FOR EACH ROW EXECUTE FUNCTION guard_group_channel_message_update();

CREATE FUNCTION reject_group_channel_message_truncate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'group channel messages cannot be truncated';
END;
$$;

CREATE TRIGGER group_channel_messages_reject_truncate
BEFORE TRUNCATE ON group_channel_messages
FOR EACH STATEMENT EXECUTE FUNCTION reject_group_channel_message_truncate();

CREATE TABLE group_channel_reads (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id UUID REFERENCES group_channel_messages (id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration 014 hands the external runtime role full DML on new tables by
-- default. Keep only what the app needs: append + soft-delete on messages,
-- upsert on read cursors, in-place edits on the singleton.
DO $group_channel_runtime_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE DELETE ON TABLE group_channel_messages FROM itqanak_runtime;
  GRANT SELECT, INSERT, UPDATE ON TABLE group_channel_messages TO itqanak_runtime;

  REVOKE DELETE ON TABLE group_channel_reads FROM itqanak_runtime;
  GRANT SELECT, INSERT, UPDATE ON TABLE group_channel_reads TO itqanak_runtime;

  REVOKE INSERT, DELETE ON TABLE group_channel_settings FROM itqanak_runtime;
  GRANT SELECT, UPDATE ON TABLE group_channel_settings TO itqanak_runtime;
END;
$group_channel_runtime_privileges$;
