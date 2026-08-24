-- Audited, database-backed operational controls. These controls never grant
-- the Web process host, Docker, or root access: maintenance is enforced at the
-- request boundary and the Worker only pauses claiming new malware-scan jobs.

CREATE TABLE platform_operational_settings (
  singleton_key TEXT PRIMARY KEY DEFAULT 'platform'
    CHECK (singleton_key = 'platform'),
  maintenance_enabled BOOLEAN NOT NULL DEFAULT false,
  maintenance_message_ar TEXT NOT NULL
    CHECK (char_length(btrim(maintenance_message_ar)) BETWEEN 10 AND 1000),
  maintenance_message_en TEXT NOT NULL
    CHECK (char_length(btrim(maintenance_message_en)) BETWEEN 10 AND 1000),
  file_scan_queue_paused BOOLEAN NOT NULL DEFAULT false,
  file_scanner_observed_state TEXT NOT NULL DEFAULT 'UNKNOWN'
    CHECK (file_scanner_observed_state IN ('UNKNOWN', 'STARTING', 'RUNNING', 'STOPPED', 'ERROR')),
  file_scanner_observed_at TIMESTAMPTZ,
  file_scanner_observed_detail TEXT
    CHECK (
      file_scanner_observed_detail IS NULL
      OR char_length(file_scanner_observed_detail) BETWEEN 1 AND 80
    ),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

INSERT INTO platform_operational_settings (
  singleton_key,
  maintenance_message_ar,
  maintenance_message_en
) VALUES (
  'platform',
  'المنصة قيد الصيانة حالياً. نعمل على إعادتكم بأسرع وقت.',
  'The platform is currently under maintenance. Please check back shortly.'
);

CREATE TABLE platform_operational_setting_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('OPERATIONAL_SETTINGS_UPDATED', 'FILE_SCANNER_STATE_OBSERVED')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  previous_state JSONB NOT NULL CHECK (jsonb_typeof(previous_state) = 'object'),
  next_state JSONB NOT NULL CHECK (jsonb_typeof(next_state) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX platform_operational_setting_events_occurred_idx
  ON platform_operational_setting_events (occurred_at DESC, id DESC);

CREATE FUNCTION enforce_platform_operational_settings_singleton()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'platform operational settings singleton cannot be deleted';
  END IF;

  IF NEW.singleton_key IS DISTINCT FROM OLD.singleton_key THEN
    RAISE EXCEPTION 'platform operational settings singleton key cannot be changed';
  END IF;

  IF NEW.version IS DISTINCT FROM OLD.version THEN
    IF NEW.version <> OLD.version + 1 THEN
      RAISE EXCEPTION 'platform operational settings version must advance by one';
    END IF;

    IF ROW(
      NEW.file_scanner_observed_state,
      NEW.file_scanner_observed_at,
      NEW.file_scanner_observed_detail
    ) IS DISTINCT FROM ROW(
      OLD.file_scanner_observed_state,
      OLD.file_scanner_observed_at,
      OLD.file_scanner_observed_detail
    ) THEN
      RAISE EXCEPTION 'desired and observed operational state cannot change together';
    END IF;

    IF NEW.updated_by_user_id IS NULL THEN
      RAISE EXCEPTION 'platform operational settings changes require an actor';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM users
      INNER JOIN user_roles ON user_roles.user_id = users.id
      WHERE users.id = NEW.updated_by_user_id
        AND users.status = 'ACTIVE'
        AND user_roles.role_code = 'ADMIN'
    ) THEN
      RAISE EXCEPTION 'platform operational settings actor must be an active administrator';
    END IF;

    NEW.updated_at := now();
  ELSE
    IF ROW(
      NEW.maintenance_enabled,
      NEW.maintenance_message_ar,
      NEW.maintenance_message_en,
      NEW.file_scan_queue_paused,
      NEW.updated_by_user_id,
      NEW.updated_at
    ) IS DISTINCT FROM ROW(
      OLD.maintenance_enabled,
      OLD.maintenance_message_ar,
      OLD.maintenance_message_en,
      OLD.file_scan_queue_paused,
      OLD.updated_by_user_id,
      OLD.updated_at
    ) THEN
      RAISE EXCEPTION 'observed-state updates cannot change administrator settings';
    END IF;

    IF NEW.file_scanner_observed_at IS NULL THEN
      RAISE EXCEPTION 'file scanner observed state requires an observation timestamp';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_operational_settings_guard
BEFORE UPDATE OR DELETE ON platform_operational_settings
FOR EACH ROW EXECUTE FUNCTION enforce_platform_operational_settings_singleton();

CREATE FUNCTION record_platform_operational_setting_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.version IS DISTINCT FROM OLD.version THEN
    INSERT INTO public.platform_operational_setting_events (
      event_type,
      actor_user_id,
      version,
      previous_state,
      next_state
    ) VALUES (
      'OPERATIONAL_SETTINGS_UPDATED',
      NEW.updated_by_user_id,
      NEW.version,
      jsonb_build_object(
        'maintenanceEnabled', OLD.maintenance_enabled,
        'maintenanceMessageAr', OLD.maintenance_message_ar,
        'maintenanceMessageEn', OLD.maintenance_message_en,
        'fileScanQueuePaused', OLD.file_scan_queue_paused
      ),
      jsonb_build_object(
        'maintenanceEnabled', NEW.maintenance_enabled,
        'maintenanceMessageAr', NEW.maintenance_message_ar,
        'maintenanceMessageEn', NEW.maintenance_message_en,
        'fileScanQueuePaused', NEW.file_scan_queue_paused
      )
    );
  ELSIF ROW(
    NEW.file_scanner_observed_state,
    NEW.file_scanner_observed_at,
    NEW.file_scanner_observed_detail
  ) IS DISTINCT FROM ROW(
    OLD.file_scanner_observed_state,
    OLD.file_scanner_observed_at,
    OLD.file_scanner_observed_detail
  ) THEN
    INSERT INTO public.platform_operational_setting_events (
      event_type,
      actor_user_id,
      version,
      previous_state,
      next_state
    ) VALUES (
      'FILE_SCANNER_STATE_OBSERVED',
      NULL,
      NEW.version,
      jsonb_build_object(
        'state', OLD.file_scanner_observed_state,
        'detail', OLD.file_scanner_observed_detail
      ),
      jsonb_build_object(
        'state', NEW.file_scanner_observed_state,
        'detail', NEW.file_scanner_observed_detail
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_operational_settings_audit
AFTER UPDATE ON platform_operational_settings
FOR EACH ROW EXECUTE FUNCTION record_platform_operational_setting_event();

CREATE FUNCTION reject_platform_operational_setting_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'platform operational setting history is append-only';
END;
$$;

CREATE TRIGGER platform_operational_setting_events_append_only
BEFORE UPDATE OR DELETE ON platform_operational_setting_events
FOR EACH ROW EXECUTE FUNCTION reject_platform_operational_setting_event_mutation();

CREATE TRIGGER platform_operational_setting_events_reject_truncate
BEFORE TRUNCATE ON platform_operational_setting_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_platform_operational_setting_event_mutation();

INSERT INTO permissions (code, description) VALUES
  ('admin.operations.read', 'Read platform operational controls and safe service status'),
  ('admin.operations.manage', 'Manage maintenance mode and malware-scan queue processing')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('ADMIN', 'admin.operations.read'),
  ('ADMIN', 'admin.operations.manage'),
  ('SYSTEM', 'admin.operations.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Migration 014 grants bounded runtime access to future objects. Narrow the
-- singleton and immutable ledger explicitly when the external runtime role is
-- provisioned. The role is never created or altered by this migration.
DO $runtime_operational_privileges$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'itqanak_runtime') THEN
    RETURN;
  END IF;

  REVOKE INSERT, UPDATE, DELETE ON TABLE platform_operational_settings FROM itqanak_runtime;
  GRANT SELECT ON TABLE platform_operational_settings TO itqanak_runtime;
  GRANT UPDATE (
    maintenance_enabled,
    maintenance_message_ar,
    maintenance_message_en,
    file_scan_queue_paused,
    version,
    updated_by_user_id
  ) ON TABLE platform_operational_settings TO itqanak_runtime;

  REVOKE INSERT, UPDATE, DELETE ON TABLE platform_operational_setting_events
    FROM itqanak_runtime;
  GRANT SELECT ON TABLE platform_operational_setting_events TO itqanak_runtime;
END;
$runtime_operational_privileges$;

REVOKE EXECUTE ON FUNCTION record_platform_operational_setting_event() FROM PUBLIC;
