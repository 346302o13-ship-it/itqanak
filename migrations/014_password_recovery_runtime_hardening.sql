-- Defense in depth for phone-first password recovery and the unprivileged
-- application database role. This migration is forward-only. Do not edit it
-- after it is applied.

ALTER TABLE phone_password_reset_requests
  ADD CONSTRAINT phone_password_reset_requests_phone_e164_check
  CHECK (
    phone_e164 ~ '^\+(9665[0-9]{8}|9715[0-9]{8}|965[569][0-9]{7})$'
  );

-- Issuance expires an older approved request before approving another. Keep
-- that service invariant enforceable even under an unexpected concurrent or
-- operator-driven write.
CREATE UNIQUE INDEX phone_password_reset_requests_approved_user_idx
  ON phone_password_reset_requests (user_id)
  WHERE status = 'APPROVED';

CREATE FUNCTION validate_phone_password_reset_request_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  registered_phone_e164 TEXT;
BEGIN
  -- Let the declarative NOT NULL/E.164 constraints own malformed-value errors.
  -- The trigger is responsible only for the cross-table identity invariant.
  IF NEW.phone_e164 IS NULL OR NEW.phone_e164 !~ '^\+(9665[0-9]{8}|9715[0-9]{8}|965[569][0-9]{7})$' THEN
    RETURN NEW;
  END IF;

  SELECT users.phone_e164
  INTO registered_phone_e164
  FROM users
  WHERE users.id = NEW.user_id
  FOR SHARE;

  IF NOT FOUND OR registered_phone_e164 IS DISTINCT FROM NEW.phone_e164 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'phone password reset identity does not match the registered user',
      CONSTRAINT = 'phone_password_reset_requests_phone_matches_user';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER phone_password_reset_requests_validate_identity
BEFORE INSERT OR UPDATE OF user_id, phone_e164 ON phone_password_reset_requests
FOR EACH ROW EXECUTE FUNCTION validate_phone_password_reset_request_identity();

-- The runtime login and its password are provisioned outside migrations. A
-- fresh CI database therefore remains migratable without the role, while a
-- production database fails closed if the provisioned role is over-privileged.
DO $runtime_privileges$
DECLARE
  runtime_role_name CONSTANT TEXT := 'itqanak_runtime';
  runtime_role RECORD;
BEGIN
  SELECT oid, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
         rolreplication, rolbypassrls
  INTO runtime_role
  FROM pg_roles
  WHERE rolname = runtime_role_name;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF NOT runtime_role.rolcanlogin
     OR runtime_role.rolsuper
     OR runtime_role.rolcreatedb
     OR runtime_role.rolcreaterole
     OR runtime_role.rolreplication
     OR runtime_role.rolbypassrls THEN
    RAISE EXCEPTION 'itqanak_runtime must be a LOGIN role without elevated PostgreSQL attributes';
  END IF;

  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO %I',
    current_database(),
    runtime_role_name
  );
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', runtime_role_name);
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',
    runtime_role_name
  );

  -- Future objects created by this migration owner receive the same bounded
  -- application capabilities. A migration that adds another immutable ledger
  -- must explicitly narrow it, as done for the current ledgers below.
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I',
    runtime_role_name
  );

  -- Runtime readiness reads the migration ledger but may never forge it.
  EXECUTE format(
    'REVOKE INSERT, UPDATE, DELETE ON TABLE schema_migrations FROM %I',
    runtime_role_name
  );
  EXECUTE format('GRANT SELECT ON TABLE schema_migrations TO %I', runtime_role_name);

  -- These histories are append-only at the database layer. Reflect that in
  -- grants as well, so ordinary runtime SQL cannot even attempt mutation.
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON TABLE security_audit_events, service_request_events, service_request_messages, content_block_events FROM %I',
    runtime_role_name
  );
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE security_audit_events, service_request_events, service_request_messages, content_block_events TO %I',
    runtime_role_name
  );
END;
$runtime_privileges$;
