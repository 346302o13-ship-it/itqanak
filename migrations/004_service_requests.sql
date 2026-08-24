-- Phase 3 service requests, immutable history, idempotency, and authorization.
-- Request numbers use one non-cycling sequence. Gaps are expected because
-- PostgreSQL sequences are deliberately not rolled back with failed writes.
-- This migration is forward-only. Do not edit after it is applied.

CREATE SEQUENCE service_request_number_seq AS BIGINT START WITH 1 INCREMENT BY 1 NO CYCLE;

CREATE FUNCTION next_service_request_number()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  sequence_value BIGINT := nextval('service_request_number_seq');
  sequence_text TEXT := sequence_value::TEXT;
BEGIN
  RETURN 'ITQ-' || to_char(CURRENT_DATE, 'YYYY') || '-' ||
    repeat('0', greatest(0, 6 - char_length(sequence_text))) || sequence_text;
END;
$$;

CREATE TABLE service_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number TEXT NOT NULL UNIQUE DEFAULT next_service_request_number()
    CHECK (request_number ~ '^ITQ-[0-9]{4}-[0-9]{6,}$'),
  student_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL DEFAULT 'SERVICE'
    CHECK (request_kind IN ('SERVICE', 'CONVERSATION')),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (
      status IN (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'WAITING_FOR_STUDENT',
        'QUOTED',
        'ACCEPTED',
        'IN_PROGRESS',
        'DELIVERED',
        'REVISION_REQUESTED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      )
    ),
  title TEXT NOT NULL
    CHECK (char_length(btrim(title)) = 0 OR char_length(btrim(title)) BETWEEN 3 AND 160),
  description TEXT NOT NULL
    CHECK (char_length(btrim(description)) = 0 OR char_length(btrim(description)) BETWEEN 10 AND 10000),
  deadline_at TIMESTAMPTZ,
  urgency TEXT NOT NULL DEFAULT 'NORMAL' CHECK (urgency IN ('NORMAL', 'URGENT')),
  budget_amount NUMERIC(12, 2)
    CHECK (budget_amount IS NULL OR budget_amount BETWEEN 0 AND 1000000),
  budget_currency CHAR(3)
    CHECK (budget_currency IS NULL OR budget_currency ~ '^[A-Z]{3}$'),
  language_code TEXT
    CHECK (language_code IS NULL OR language_code IN ('ar', 'en', 'fr', 'de', 'es', 'tr')),
  academic_level TEXT
    CHECK (
      academic_level IS NULL
      OR academic_level IN (
        'SECONDARY',
        'DIPLOMA',
        'BACHELOR',
        'MASTER',
        'DOCTORATE',
        'PROFESSIONAL',
        'OTHER'
      )
    ),
  institution_name TEXT
    CHECK (institution_name IS NULL OR char_length(btrim(institution_name)) BETWEEN 2 AND 200),
  privacy_requested BOOLEAN NOT NULL DEFAULT false,
  submission_key UUID NOT NULL,
  submission_fingerprint CHAR(64) NOT NULL
    CHECK (submission_fingerprint ~ '^[0-9a-f]{64}$'),
  academic_integrity_version TEXT
    CHECK (
      academic_integrity_version IS NULL
      OR char_length(btrim(academic_integrity_version)) BETWEEN 1 AND 64
    ),
  academic_integrity_accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (student_user_id, submission_key),
  CHECK ((budget_amount IS NULL) = (budget_currency IS NULL)),
  CHECK ((academic_integrity_version IS NULL) = (academic_integrity_accepted_at IS NULL)),
  CHECK (deadline_at IS NULL OR deadline_at > created_at),
  CHECK (updated_at >= created_at),
  CHECK (
    academic_integrity_accepted_at IS NULL
    OR academic_integrity_accepted_at >= created_at
  ),
  CHECK (submitted_at IS NULL OR submitted_at >= created_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= created_at),
  CHECK (completed_at IS NULL OR completed_at >= created_at),
  CHECK (status IN ('DRAFT', 'CANCELLED') OR submitted_at IS NOT NULL),
  CHECK (submitted_at IS NULL OR academic_integrity_accepted_at IS NOT NULL),
  CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
  CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL))
);

CREATE INDEX service_requests_student_created_idx
  ON service_requests (student_user_id, created_at DESC, id DESC);
CREATE INDEX service_requests_student_status_created_idx
  ON service_requests (student_user_id, status, created_at DESC, id DESC);
CREATE INDEX service_requests_service_status_idx
  ON service_requests (service_id, status);

CREATE TABLE service_request_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id UUID NOT NULL REFERENCES service_requests(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type ~ '^[A-Z][A-Z0-9_]{2,119}$'),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('STUDENT', 'ADMIN', 'SYSTEM')),
  actor_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  from_status TEXT
    CHECK (
      from_status IS NULL
      OR from_status IN (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'WAITING_FOR_STUDENT',
        'QUOTED',
        'ACCEPTED',
        'IN_PROGRESS',
        'DELIVERED',
        'REVISION_REQUESTED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      )
    ),
  to_status TEXT
    CHECK (
      to_status IS NULL
      OR to_status IN (
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'WAITING_FOR_STUDENT',
        'QUOTED',
        'ACCEPTED',
        'IN_PROGRESS',
        'DELIVERED',
        'REVISION_REQUESTED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      )
    ),
  request_version INTEGER NOT NULL CHECK (request_version > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  correlation_id TEXT CHECK (correlation_id IS NULL OR char_length(correlation_id) <= 128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((from_status IS NULL) = (to_status IS NULL)),
  CHECK (from_status IS NULL OR from_status <> to_status),
  CHECK (
    (actor_type = 'SYSTEM' AND actor_user_id IS NULL)
    OR (actor_type IN ('STUDENT', 'ADMIN') AND actor_user_id IS NOT NULL)
  )
);

CREATE INDEX service_request_events_request_created_idx
  ON service_request_events (request_id, created_at, id);

CREATE FUNCTION reject_service_request_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'service request event history is append-only';
END;
$$;

CREATE TRIGGER service_request_events_append_only
BEFORE UPDATE OR DELETE ON service_request_events
FOR EACH ROW EXECUTE FUNCTION reject_service_request_event_mutation();

-- Row-level triggers do not fire for TRUNCATE. Keep the history immutable for
-- every table mutation path, including an accidental operator-issued truncate.
CREATE TRIGGER service_request_events_reject_truncate
BEFORE TRUNCATE ON service_request_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_service_request_event_mutation();

ALTER TABLE security_audit_events
  ADD COLUMN resource_type TEXT,
  ADD COLUMN resource_id UUID,
  ADD CONSTRAINT security_audit_events_resource_pair_check
    CHECK ((resource_type IS NULL) = (resource_id IS NULL)),
  ADD CONSTRAINT security_audit_events_resource_type_check
    CHECK (
      resource_type IS NULL
      OR (resource_type ~ '^[a-z][a-z0-9_.-]{1,63}$')
    );

CREATE INDEX security_audit_events_resource_occurred_idx
  ON security_audit_events (resource_type, resource_id, occurred_at DESC)
  WHERE resource_id IS NOT NULL;

INSERT INTO permissions (code, description) VALUES
  ('requests.create', 'Create a service request for the authenticated student'),
  ('requests.read.own', 'Read service requests owned by the authenticated student'),
  ('requests.update.own', 'Update eligible service requests owned by the authenticated student'),
  ('requests.cancel.own', 'Cancel eligible service requests owned by the authenticated student'),
  ('admin.requests.read', 'Read service requests administratively'),
  ('admin.requests.manage', 'Manage service requests administratively')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'requests.create'),
  ('STUDENT', 'requests.read.own'),
  ('STUDENT', 'requests.update.own'),
  ('STUDENT', 'requests.cancel.own'),
  ('ADMIN', 'admin.requests.read'),
  ('ADMIN', 'admin.requests.manage'),
  ('SYSTEM', 'admin.requests.read'),
  ('SYSTEM', 'admin.requests.manage')
ON CONFLICT (role_code, permission_code) DO NOTHING;
