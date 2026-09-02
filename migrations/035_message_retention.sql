-- Conversation-message retention.
--
-- After a retention window (default 30 days) a support message is *archived*:
-- its retained content (body + metadata) is copied to support_message_archive
-- and then replaced in support_messages with a fixed marker, and archived_at is
-- stamped. The row itself is never deleted -- every foreign key (receipts,
-- revisions, reactions) and every AFTER INSERT projection stays intact -- so the
-- append-only ledger keeps its shape; only the retained text leaves the hot
-- table. The chat then renders "this message was archived" in that message's
-- place.
--
-- Archival is OFF by default. An administrator turns it on and sets the window
-- in platform_retention_settings; the Worker sweep is a no-op until then.

ALTER TABLE support_messages
  ADD COLUMN archived_at TIMESTAMPTZ;

CREATE INDEX support_messages_retention_sweep_idx
  ON support_messages (sent_at, id)
  WHERE archived_at IS NULL;

CREATE TABLE support_message_archive (
  message_id UUID PRIMARY KEY REFERENCES support_messages (id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES support_conversations (id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_user_id UUID,
  content_type TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  original_sent_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_message_archive_conversation_idx
  ON support_message_archive (conversation_id, original_sent_at DESC);

CREATE TABLE platform_retention_settings (
  singleton_key TEXT PRIMARY KEY DEFAULT 'platform'
    CHECK (singleton_key = 'platform'),
  message_archival_enabled BOOLEAN NOT NULL DEFAULT false,
  message_retention_days INTEGER NOT NULL DEFAULT 30
    CHECK (message_retention_days BETWEEN 7 AND 3650),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

INSERT INTO platform_retention_settings (singleton_key) VALUES ('platform');

CREATE FUNCTION enforce_platform_retention_settings_singleton()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform retention settings singleton cannot be deleted';
  END IF;
  IF NEW.singleton_key IS DISTINCT FROM OLD.singleton_key THEN
    RAISE EXCEPTION 'platform retention settings singleton key cannot be changed';
  END IF;
  IF NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'platform retention settings version must advance by one';
  END IF;
  IF NEW.updated_by_user_id IS NULL THEN
    RAISE EXCEPTION 'platform retention settings changes require an actor';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.updated_by_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'platform retention settings actor must be an active administrator';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_retention_settings_guard
BEFORE UPDATE OR DELETE ON platform_retention_settings
FOR EACH ROW EXECUTE FUNCTION enforce_platform_retention_settings_singleton();

-- Relax the support-message immutability guard to permit exactly one kind of
-- UPDATE: a one-way archival that stamps archived_at and swaps the retained
-- content for the fixed marker. Every other column stays identical, archived_at
-- can only go from NULL to set, and DELETE / TRUNCATE / any other UPDATE are
-- still rejected. This function backs support_messages_append_only and
-- support_messages_reject_truncate (migration 016).
CREATE OR REPLACE FUNCTION reject_support_message_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.archived_at IS NULL
     AND NEW.archived_at IS NOT NULL
     AND NEW.body = '__ARCHIVED__'
     AND NEW.metadata = '{}'::jsonb
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.conversation_id IS NOT DISTINCT FROM OLD.conversation_id
     AND NEW.sender_type IS NOT DISTINCT FROM OLD.sender_type
     AND NEW.sender_user_id IS NOT DISTINCT FROM OLD.sender_user_id
     AND NEW.content_type IS NOT DISTINCT FROM OLD.content_type
     AND NEW.client_message_id IS NOT DISTINCT FROM OLD.client_message_id
     AND NEW.client_payload_fingerprint IS NOT DISTINCT FROM OLD.client_payload_fingerprint
     AND NEW.sent_at IS NOT DISTINCT FROM OLD.sent_at
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'support messages are immutable';
END;
$$;

DO $runtime_retention_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  GRANT UPDATE (archived_at, body, metadata) ON TABLE support_messages TO itqanak_runtime;
  GRANT SELECT, INSERT ON TABLE support_message_archive TO itqanak_runtime;
  GRANT SELECT, UPDATE ON TABLE platform_retention_settings TO itqanak_runtime;
END;
$runtime_retention_privileges$;
