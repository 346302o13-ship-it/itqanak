-- Admin-editable platform messaging: the support WhatsApp number shown to
-- students, the recipient the Worker sends registration / request-review
-- WhatsApp notifications to, and a broadcast announcement banner.
--
-- Everything here overrides configuration that was previously environment-only
-- (WHATSAPP_SUPPORT_RECIPIENT_E164, the SUPPORT_WHATSAPP_E164 constant). A NULL
-- override means "fall back to the deployed environment value", so an empty
-- row is a no-op and the environment stays authoritative until an administrator
-- changes something.

CREATE TABLE platform_messaging_settings (
  singleton_key TEXT PRIMARY KEY DEFAULT 'platform'
    CHECK (singleton_key = 'platform'),
  -- E.164, or NULL to keep the environment value.
  support_whatsapp_e164 TEXT
    CHECK (support_whatsapp_e164 IS NULL OR support_whatsapp_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_notify_recipient_e164 TEXT
    CHECK (
      whatsapp_notify_recipient_e164 IS NULL
      OR whatsapp_notify_recipient_e164 ~ '^\+[1-9][0-9]{7,14}$'
    ),
  announcement_active BOOLEAN NOT NULL DEFAULT false,
  announcement_level TEXT NOT NULL DEFAULT 'INFO'
    CHECK (announcement_level IN ('INFO', 'WARNING', 'CRITICAL')),
  announcement_ar TEXT
    CHECK (announcement_ar IS NULL OR char_length(btrim(announcement_ar)) BETWEEN 2 AND 600),
  announcement_en TEXT
    CHECK (announcement_en IS NULL OR char_length(btrim(announcement_en)) BETWEEN 2 AND 600),
  announcement_published_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at),
  -- An active announcement must carry both languages.
  CHECK (
    NOT announcement_active
    OR (announcement_ar IS NOT NULL AND announcement_en IS NOT NULL)
  )
);

INSERT INTO platform_messaging_settings (singleton_key) VALUES ('platform');

CREATE FUNCTION enforce_platform_messaging_settings_singleton()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'platform messaging settings cannot be truncated';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform messaging settings row cannot be deleted';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM platform_messaging_settings) THEN
    RAISE EXCEPTION 'platform messaging settings is a singleton';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.singleton_key := 'platform';
    NEW.created_at := OLD.created_at;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_messaging_settings_guard
BEFORE INSERT OR UPDATE OR DELETE ON platform_messaging_settings
FOR EACH ROW EXECUTE FUNCTION enforce_platform_messaging_settings_singleton();

CREATE TRIGGER platform_messaging_settings_reject_truncate
BEFORE TRUNCATE ON platform_messaging_settings
FOR EACH STATEMENT EXECUTE FUNCTION enforce_platform_messaging_settings_singleton();

-- Migration 014 grants the external runtime role bounded DML on future tables.
-- This singleton is only ever read and updated in place; take away INSERT and
-- DELETE and keep SELECT + UPDATE.
DO $runtime_messaging_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE INSERT, DELETE ON TABLE platform_messaging_settings FROM itqanak_runtime;
  GRANT SELECT, UPDATE ON TABLE platform_messaging_settings TO itqanak_runtime;
END;
$runtime_messaging_privileges$;
