-- Security audit history is evidence, not mutable application state. Reject
-- every table mutation path while preserving INSERT for new audit records.

CREATE FUNCTION reject_security_audit_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'security audit event history is append-only';
END;
$$;

CREATE TRIGGER security_audit_events_append_only
BEFORE UPDATE OR DELETE ON security_audit_events
FOR EACH ROW EXECUTE FUNCTION reject_security_audit_event_mutation();

-- Row-level triggers do not fire for TRUNCATE, so guard it separately.
CREATE TRIGGER security_audit_events_reject_truncate
BEFORE TRUNCATE ON security_audit_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_security_audit_event_mutation();
