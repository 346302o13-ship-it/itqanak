-- Student-submitted payment receipts for finance dues (a P2P-style "I paid,
-- here is the proof" step before the administrator marks the due PAID).
--
-- The receipt image reuses the unified conversation attachment pipeline
-- (upload + object storage + preview), so no new storage code is needed. The
-- finance_dues status machine is untouched: a due stays UNPAID until the
-- administrator accepts a submission, which then runs the existing
-- record-payment path (UNPAID -> PAID). The reviewer-field invariant is the
-- only rule enforced here; ownership / due-state / attachment checks live in
-- the service, like the rest of the finance package.

CREATE TABLE finance_payment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  due_id UUID NOT NULL REFERENCES finance_dues (id) ON DELETE RESTRICT,
  student_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  attachment_id UUID NOT NULL
    REFERENCES unified_conversation_attachments (id) ON DELETE RESTRICT,
  note TEXT CHECK (note IS NULL OR char_length(btrim(note)) BETWEEN 1 AND 1000),
  review_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (review_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID REFERENCES users (id) ON DELETE RESTRICT,
  review_note TEXT
    CHECK (review_note IS NULL OR char_length(btrim(review_note)) BETWEEN 1 AND 1000),
  CHECK (
    (review_status = 'PENDING' AND reviewed_at IS NULL AND reviewed_by_user_id IS NULL)
    OR (
      review_status IN ('ACCEPTED', 'REJECTED')
      AND reviewed_at IS NOT NULL
      AND reviewed_by_user_id IS NOT NULL
    )
  ),
  CHECK (reviewed_at IS NULL OR reviewed_at >= submitted_at)
);

-- At most one pending submission per due.
CREATE UNIQUE INDEX finance_payment_submissions_one_pending_per_due
  ON finance_payment_submissions (due_id)
  WHERE review_status = 'PENDING';

CREATE INDEX finance_payment_submissions_due_idx
  ON finance_payment_submissions (due_id, submitted_at DESC, id DESC);
CREATE INDEX finance_payment_submissions_pending_idx
  ON finance_payment_submissions (submitted_at)
  WHERE review_status = 'PENDING';
CREATE INDEX finance_payment_submissions_student_idx
  ON finance_payment_submissions (student_user_id, submitted_at DESC, id DESC);

-- Submitting a receipt reuses `finance.read.own`; reviewing reuses
-- `admin.finance.manage`, so no new permission codes are introduced.
