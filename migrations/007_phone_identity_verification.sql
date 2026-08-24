-- Phone-first student identity and manual WhatsApp verification for SA/AE/KW.
-- Existing email accounts remain valid. New phone accounts become ACTIVE only
-- after an ADMIN records evidence that the student contacted support from the
-- same WhatsApp number. This migration is forward-only.

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_check,
  DROP CONSTRAINT IF EXISTS users_email_check,
  DROP CONSTRAINT IF EXISTS users_email_normalized_check,
  ALTER COLUMN email DROP NOT NULL,
  ALTER COLUMN email_normalized DROP NOT NULL,
  ADD COLUMN country_code CHAR(2),
  ADD COLUMN phone_e164 TEXT,
  ADD COLUMN phone_verified_at TIMESTAMPTZ,
  ADD COLUMN phone_verification_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
  ADD COLUMN phone_verification_requested_at TIMESTAMPTZ,
  ADD COLUMN phone_verification_confirmed_at TIMESTAMPTZ,
  ADD COLUMN phone_verification_confirmed_by_user_id UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN phone_verification_reference TEXT,
  ADD COLUMN phone_verification_note TEXT;

ALTER TABLE users
  ADD CONSTRAINT users_email_optional_length_check
    CHECK (email IS NULL OR char_length(email) BETWEEN 3 AND 320),
  ADD CONSTRAINT users_email_normalized_optional_length_check
    CHECK (email_normalized IS NULL OR char_length(email_normalized) BETWEEN 3 AND 320),
  ADD CONSTRAINT users_email_pair_check
    CHECK ((email IS NULL) = (email_normalized IS NULL)),
  ADD CONSTRAINT users_phone_country_pair_check
    CHECK ((phone_e164 IS NULL) = (country_code IS NULL)),
  ADD CONSTRAINT users_country_code_check
    CHECK (country_code IS NULL OR country_code IN ('SA', 'AE', 'KW')),
  ADD CONSTRAINT users_phone_e164_check
    CHECK (
      phone_e164 IS NULL
      OR phone_e164 ~ '^\+(9665[0-9]{8}|9715[0-9]{8}|965[569][0-9]{7})$'
    ),
  ADD CONSTRAINT users_phone_matches_country_check
    CHECK (
      phone_e164 IS NULL
      OR (country_code = 'SA' AND phone_e164 LIKE '+966%')
      OR (country_code = 'AE' AND phone_e164 LIKE '+971%')
      OR (country_code = 'KW' AND phone_e164 LIKE '+965%')
    ),
  ADD CONSTRAINT users_phone_verification_status_check
    CHECK (phone_verification_status IN ('NOT_REQUIRED', 'PENDING', 'VERIFIED')),
  ADD CONSTRAINT users_phone_verification_state_check
    CHECK (
      (
        phone_verification_status = 'NOT_REQUIRED'
        AND phone_verified_at IS NULL
        AND phone_verification_requested_at IS NULL
        AND phone_verification_confirmed_at IS NULL
        AND phone_verification_confirmed_by_user_id IS NULL
        AND phone_verification_reference IS NULL
        AND phone_verification_note IS NULL
      )
      OR (
        phone_verification_status = 'PENDING'
        AND phone_e164 IS NOT NULL
        AND phone_verified_at IS NULL
        AND phone_verification_requested_at IS NOT NULL
        AND phone_verification_confirmed_at IS NULL
        AND phone_verification_confirmed_by_user_id IS NULL
        AND phone_verification_reference IS NULL
        AND phone_verification_note IS NULL
      )
      OR (
        phone_verification_status = 'VERIFIED'
        AND phone_e164 IS NOT NULL
        AND phone_verified_at IS NOT NULL
        AND phone_verification_requested_at IS NOT NULL
        AND phone_verification_confirmed_at IS NOT NULL
        AND phone_verification_confirmed_by_user_id IS NOT NULL
        AND phone_verification_reference IS NOT NULL
      )
    ),
  ADD CONSTRAINT users_phone_verification_time_check
    CHECK (
      phone_verified_at IS NULL
      OR (
        phone_verification_requested_at IS NOT NULL
        AND phone_verified_at >= phone_verification_requested_at
        AND phone_verification_confirmed_at = phone_verified_at
      )
    ),
  ADD CONSTRAINT users_phone_reference_length_check
    CHECK (
      phone_verification_reference IS NULL
      OR char_length(btrim(phone_verification_reference)) BETWEEN 3 AND 160
    ),
  ADD CONSTRAINT users_phone_note_length_check
    CHECK (
      phone_verification_note IS NULL
      OR char_length(btrim(phone_verification_note)) BETWEEN 1 AND 1000
    ),
  ADD CONSTRAINT users_verified_identity_check
    CHECK (
      (
        status = 'PENDING_VERIFICATION'
        AND email_verified_at IS NULL
        AND phone_verified_at IS NULL
      )
      OR (
        status IN ('ACTIVE', 'SUSPENDED', 'DISABLED')
        AND (email_verified_at IS NOT NULL OR phone_verified_at IS NOT NULL)
      )
    );

CREATE UNIQUE INDEX users_phone_e164_unique_idx
  ON users (phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX users_pending_phone_verification_idx
  ON users (phone_verification_requested_at, id)
  WHERE phone_verification_status = 'PENDING';
