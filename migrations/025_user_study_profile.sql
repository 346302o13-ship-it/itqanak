-- One-time study profile on the user.
--
-- academic_level and institution_name are stable per student but were re-asked
-- on every service request with nowhere to store them. Holding them here lets
-- the new-request form pre-fill (and eventually stop asking). Nullable and
-- additive; the request columns are unchanged.

ALTER TABLE users
  ADD COLUMN academic_level TEXT
    CHECK (
      academic_level IS NULL
      OR academic_level IN (
        'SECONDARY', 'DIPLOMA', 'BACHELOR', 'MASTER', 'DOCTORATE', 'PROFESSIONAL', 'OTHER'
      )
    ),
  ADD COLUMN institution_name TEXT
    CHECK (institution_name IS NULL OR char_length(institution_name) BETWEEN 2 AND 200);
