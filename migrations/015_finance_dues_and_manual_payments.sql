-- Internal financial dues and manually confirmed payments.
-- This migration deliberately does not integrate with, or retain credentials
-- for, an external payment gateway. Monetary values are integer minor units.
-- This migration is forward-only. Do not edit after it is applied.

CREATE SEQUENCE finance_due_reference_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE FUNCTION next_finance_due_reference()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  sequence_value BIGINT := nextval('finance_due_reference_seq');
  sequence_text TEXT := sequence_value::TEXT;
BEGIN
  RETURN 'DUE-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    repeat('0', greatest(0, 6 - char_length(sequence_text))) || sequence_text;
END;
$$;

CREATE TABLE finance_dues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE DEFAULT next_finance_due_reference()
    CHECK (reference ~ '^DUE-[0-9]{4}-[0-9]{6,}$'),
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title_ar TEXT NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 2 AND 160),
  title_en TEXT NOT NULL CHECK (char_length(btrim(title_en)) BETWEEN 2 AND 160),
  description_ar TEXT
    CHECK (description_ar IS NULL OR char_length(btrim(description_ar)) BETWEEN 2 AND 2000),
  description_en TEXT
    CHECK (description_en IS NULL OR char_length(btrim(description_en)) BETWEEN 2 AND 2000),
  amount_minor BIGINT NOT NULL,
  currency CHAR(3) NOT NULL CHECK (currency IN ('SAR', 'AED', 'KWD')),
  minor_unit SMALLINT NOT NULL CHECK (minor_unit IN (2, 3)),
  status TEXT NOT NULL DEFAULT 'UNPAID' CHECK (status IN ('UNPAID', 'PAID', 'VOIDED')),
  due_at TIMESTAMPTZ,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  paid_at TIMESTAMPTZ,
  paid_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  voided_at TIMESTAMPTZ,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK ((description_ar IS NULL) = (description_en IS NULL)),
  CHECK (
    (currency IN ('SAR', 'AED') AND amount_minor BETWEEN 1 AND 100000000)
    OR (currency = 'KWD' AND amount_minor BETWEEN 1 AND 1000000000)
  ),
  CHECK (
    (currency IN ('SAR', 'AED') AND minor_unit = 2)
    OR (currency = 'KWD' AND minor_unit = 3)
  ),
  CHECK (updated_at >= created_at),
  CHECK (paid_at IS NULL OR paid_at >= created_at),
  CHECK (voided_at IS NULL OR voided_at >= created_at),
  CHECK (
    (status = 'UNPAID' AND paid_at IS NULL AND paid_by_user_id IS NULL
      AND voided_at IS NULL AND voided_by_user_id IS NULL)
    OR (status = 'PAID' AND paid_at IS NOT NULL AND paid_by_user_id IS NOT NULL
      AND voided_at IS NULL AND voided_by_user_id IS NULL)
    OR (status = 'VOIDED' AND paid_at IS NULL AND paid_by_user_id IS NULL
      AND voided_at IS NOT NULL AND voided_by_user_id IS NOT NULL)
  )
);

CREATE INDEX finance_dues_student_created_idx
  ON finance_dues (student_user_id, created_at DESC, id DESC);
CREATE INDEX finance_dues_student_status_due_idx
  ON finance_dues (student_user_id, status, due_at, created_at DESC);
CREATE INDEX finance_dues_status_currency_created_idx
  ON finance_dues (status, currency, created_at DESC, id DESC);
CREATE INDEX finance_dues_request_idx ON finance_dues (request_id, created_at DESC, id DESC);

CREATE TABLE finance_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  due_id UUID NOT NULL REFERENCES finance_dues(id) ON DELETE RESTRICT,
  due_version INTEGER NOT NULL CHECK (due_version > 0),
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('DUE_CREATED', 'PAYMENT_RECORDED', 'PAYMENT_REVERSED', 'DUE_VOIDED')),
  amount_minor BIGINT NOT NULL CHECK (amount_minor BETWEEN -1000000000 AND 1000000000),
  currency CHAR(3) NOT NULL CHECK (currency IN ('SAR', 'AED', 'KWD')),
  minor_unit SMALLINT NOT NULL CHECK (minor_unit IN (2, 3)),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('BANK_TRANSFER', 'CASH', 'OTHER')),
  payment_reference TEXT
    CHECK (
      payment_reference IS NULL
      OR (
        char_length(btrim(payment_reference)) BETWEEN 2 AND 120
        AND payment_reference !~ '[[:cntrl:]]'
      )
    ),
  related_entry_id UUID REFERENCES finance_ledger_entries(id) ON DELETE RESTRICT,
  note TEXT
    CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 2 AND 500),
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (due_id, due_version),
  CHECK (
    (entry_type = 'DUE_CREATED'
      AND amount_minor > 0
      AND payment_method IS NULL
      AND payment_reference IS NULL
      AND related_entry_id IS NULL
      AND note IS NULL)
    OR (entry_type = 'PAYMENT_RECORDED'
      AND amount_minor > 0
      AND payment_method IS NOT NULL
      AND payment_reference IS NOT NULL
      AND related_entry_id IS NULL)
    OR (entry_type = 'PAYMENT_REVERSED'
      AND amount_minor < 0
      AND payment_method IS NULL
      AND payment_reference IS NULL
      AND related_entry_id IS NOT NULL
      AND note IS NOT NULL)
    OR (entry_type = 'DUE_VOIDED'
      AND amount_minor = 0
      AND payment_method IS NULL
      AND payment_reference IS NULL
      AND related_entry_id IS NULL
      AND note IS NOT NULL)
  )
);

CREATE INDEX finance_ledger_entries_due_created_idx
  ON finance_ledger_entries (due_id, created_at, id);
CREATE UNIQUE INDEX finance_ledger_entries_single_reversal_idx
  ON finance_ledger_entries (related_entry_id)
  WHERE entry_type = 'PAYMENT_REVERSED';

CREATE FUNCTION validate_finance_due_identity_and_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  request_student_user_id UUID;
  request_status TEXT;
  expected_entry_type TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.created_by_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'finance due creator does not have the ADMIN role';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.updated_by_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'finance due updater does not have the ADMIN role';
  END IF;

  SELECT student_user_id, status
  INTO request_student_user_id, request_status
  FROM service_requests
  WHERE id = NEW.request_id
  FOR SHARE;

  IF NOT FOUND OR request_student_user_id IS DISTINCT FROM NEW.student_user_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'finance due student does not own the linked request',
      CONSTRAINT = 'finance_dues_request_owner_match';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF request_status = 'DRAFT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'finance due cannot be created for a draft request',
        CONSTRAINT = 'finance_dues_request_submitted';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.request_id IS DISTINCT FROM OLD.request_id
     OR NEW.student_user_id IS DISTINCT FROM OLD.student_user_id
     OR NEW.reference IS DISTINCT FROM OLD.reference
     OR NEW.title_ar IS DISTINCT FROM OLD.title_ar
     OR NEW.title_en IS DISTINCT FROM OLD.title_en
     OR NEW.description_ar IS DISTINCT FROM OLD.description_ar
     OR NEW.description_en IS DISTINCT FROM OLD.description_en
     OR NEW.amount_minor IS DISTINCT FROM OLD.amount_minor
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.minor_unit IS DISTINCT FROM OLD.minor_unit
     OR NEW.due_at IS DISTINCT FROM OLD.due_at
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'finance due financial and identity fields are immutable';
  END IF;

  IF NEW.version <> OLD.version + 1 OR NEW.updated_at <= OLD.updated_at THEN
    RAISE EXCEPTION 'finance due update must increment version and timestamp';
  END IF;

  IF OLD.status = 'UNPAID' AND NEW.status = 'PAID' THEN
    expected_entry_type := 'PAYMENT_RECORDED';
    IF NEW.paid_by_user_id IS DISTINCT FROM NEW.updated_by_user_id THEN
      RAISE EXCEPTION 'finance payment confirmer must match the due updater';
    END IF;
  ELSIF OLD.status = 'PAID' AND NEW.status = 'UNPAID' THEN
    expected_entry_type := 'PAYMENT_REVERSED';
  ELSIF OLD.status = 'UNPAID' AND NEW.status = 'VOIDED' THEN
    expected_entry_type := 'DUE_VOIDED';
    IF NEW.voided_by_user_id IS DISTINCT FROM NEW.updated_by_user_id THEN
      RAISE EXCEPTION 'finance due voider must match the due updater';
    END IF;
  ELSE
    RAISE EXCEPTION 'invalid finance due status transition';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM finance_ledger_entries
    WHERE due_id = NEW.id
      AND due_version = NEW.version
      AND entry_type = expected_entry_type
      AND actor_user_id = NEW.updated_by_user_id
  ) THEN
    RAISE EXCEPTION 'finance due transition is missing its matching ledger entry';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_dues_validate_identity_and_transition
BEFORE INSERT OR UPDATE ON finance_dues
FOR EACH ROW EXECUTE FUNCTION validate_finance_due_identity_and_transition();

CREATE FUNCTION validate_finance_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  due_record finance_dues%ROWTYPE;
  related_record finance_ledger_entries%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM users
    INNER JOIN user_roles ON user_roles.user_id = users.id
    WHERE users.id = NEW.actor_user_id
      AND users.status = 'ACTIVE'
      AND user_roles.role_code = 'ADMIN'
  ) THEN
    RAISE EXCEPTION 'finance ledger actor does not have the ADMIN role';
  END IF;

  SELECT * INTO due_record
  FROM finance_dues
  WHERE id = NEW.due_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finance ledger due does not exist';
  END IF;

  IF NEW.currency <> due_record.currency OR NEW.minor_unit <> due_record.minor_unit THEN
    RAISE EXCEPTION 'finance ledger currency does not match the due';
  END IF;

  IF NEW.entry_type = 'DUE_CREATED' THEN
    IF due_record.version <> 1
       OR NEW.due_version <> 1
       OR due_record.status <> 'UNPAID'
       OR NEW.amount_minor <> due_record.amount_minor
       OR NEW.actor_user_id <> due_record.created_by_user_id
       OR EXISTS (SELECT 1 FROM finance_ledger_entries WHERE due_id = NEW.due_id) THEN
      RAISE EXCEPTION 'invalid finance due creation ledger entry';
    END IF;
  ELSIF NEW.entry_type = 'PAYMENT_RECORDED' THEN
    IF due_record.status <> 'UNPAID'
       OR NEW.due_version <> due_record.version + 1
       OR NEW.amount_minor <> due_record.amount_minor THEN
      RAISE EXCEPTION 'invalid finance payment ledger entry';
    END IF;
  ELSIF NEW.entry_type = 'PAYMENT_REVERSED' THEN
    SELECT * INTO related_record
    FROM finance_ledger_entries
    WHERE id = NEW.related_entry_id
    FOR SHARE;
    IF due_record.status <> 'PAID'
       OR NEW.due_version <> due_record.version + 1
       OR NEW.amount_minor <> -due_record.amount_minor
       OR NOT FOUND
       OR related_record.due_id <> NEW.due_id
       OR related_record.entry_type <> 'PAYMENT_RECORDED'
       OR EXISTS (
         SELECT 1 FROM finance_ledger_entries
         WHERE related_entry_id = NEW.related_entry_id
           AND entry_type = 'PAYMENT_REVERSED'
       ) THEN
      RAISE EXCEPTION 'invalid finance payment reversal ledger entry';
    END IF;
  ELSIF NEW.entry_type = 'DUE_VOIDED' THEN
    IF due_record.status <> 'UNPAID'
       OR NEW.due_version <> due_record.version + 1
       OR NEW.amount_minor <> 0 THEN
      RAISE EXCEPTION 'invalid finance due void ledger entry';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER finance_ledger_entries_validate
BEFORE INSERT ON finance_ledger_entries
FOR EACH ROW EXECUTE FUNCTION validate_finance_ledger_entry();

CREATE FUNCTION verify_finance_due_ledger_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  resulting_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'finance_dues' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM finance_ledger_entries
      WHERE due_id = NEW.id AND due_version = NEW.version
        AND (
          (NEW.version = 1 AND entry_type = 'DUE_CREATED' AND NEW.status = 'UNPAID')
          OR (entry_type = 'PAYMENT_RECORDED' AND NEW.status = 'PAID')
          OR (entry_type = 'PAYMENT_REVERSED' AND NEW.status = 'UNPAID')
          OR (entry_type = 'DUE_VOIDED' AND NEW.status = 'VOIDED')
        )
    ) THEN
      RAISE EXCEPTION 'finance due projection has no matching ledger entry';
    END IF;
    RETURN NEW;
  END IF;

  resulting_status := CASE NEW.entry_type
    WHEN 'DUE_CREATED' THEN 'UNPAID'
    WHEN 'PAYMENT_RECORDED' THEN 'PAID'
    WHEN 'PAYMENT_REVERSED' THEN 'UNPAID'
    WHEN 'DUE_VOIDED' THEN 'VOIDED'
  END;
  IF NOT EXISTS (
    SELECT 1 FROM finance_dues
    WHERE id = NEW.due_id
      AND version = NEW.due_version
      AND status = resulting_status
  ) THEN
    RAISE EXCEPTION 'finance ledger entry has no matching due projection';
  END IF;
  RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER finance_dues_ledger_consistency
AFTER INSERT OR UPDATE ON finance_dues
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_finance_due_ledger_consistency();

CREATE CONSTRAINT TRIGGER finance_ledger_entries_projection_consistency
AFTER INSERT ON finance_ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION verify_finance_due_ledger_consistency();

CREATE FUNCTION reject_finance_ledger_entry_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'finance ledger entries are append-only';
END;
$$;

CREATE TRIGGER finance_ledger_entries_append_only
BEFORE UPDATE OR DELETE ON finance_ledger_entries
FOR EACH ROW EXECUTE FUNCTION reject_finance_ledger_entry_mutation();
CREATE TRIGGER finance_ledger_entries_reject_truncate
BEFORE TRUNCATE ON finance_ledger_entries
FOR EACH STATEMENT EXECUTE FUNCTION reject_finance_ledger_entry_mutation();

INSERT INTO permissions (code, description) VALUES
  ('finance.read.own', 'Read financial dues and payment status for the authenticated student'),
  ('admin.finance.read', 'Read financial dues administratively'),
  ('admin.finance.manage', 'Create, settle, reverse, and void financial dues administratively'),
  ('admin.finance.reports.read', 'Read aggregate financial reports administratively')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'finance.read.own'),
  ('ADMIN', 'admin.finance.read'),
  ('ADMIN', 'admin.finance.manage'),
  ('ADMIN', 'admin.finance.reports.read'),
  ('SYSTEM', 'admin.finance.read'),
  ('SYSTEM', 'admin.finance.reports.read')
ON CONFLICT (role_code, permission_code) DO NOTHING;

-- Migration 014 establishes bounded defaults for the production runtime role.
-- Narrow the new financial ledger explicitly: it can be appended to, never
-- rewritten or deleted, and current dues can be projected but never deleted.
DO $runtime_finance_privileges$
DECLARE
  runtime_role_name CONSTANT TEXT := 'itqanak_runtime';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role_name) THEN
    RETURN;
  END IF;

  EXECUTE format(
    'GRANT USAGE, SELECT ON SEQUENCE finance_due_reference_seq TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'REVOKE DELETE ON TABLE finance_dues FROM %I',
    runtime_role_name
  );
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE ON TABLE finance_dues TO %I',
    runtime_role_name
  );
  EXECUTE format(
    'REVOKE UPDATE, DELETE ON TABLE finance_ledger_entries FROM %I',
    runtime_role_name
  );
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE finance_ledger_entries TO %I',
    runtime_role_name
  );
END;
$runtime_finance_privileges$;
