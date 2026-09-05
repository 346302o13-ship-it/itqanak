-- Per-admin editable canned replies for the support composer. Until now the
-- "quick replies" menu was a fixed list baked into the web app
-- (apps/web/src/lib/quick-replies.ts); this lets each admin manage their own
-- set. Scoped by created_by_user_id — an admin only ever sees and edits
-- their own rows. The built-in defaults still show alongside these in the UI.

CREATE TABLE admin_quick_replies (
  id BIGSERIAL PRIMARY KEY,
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 2000),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_quick_replies_updated_after_created CHECK (updated_at >= created_at)
);

CREATE INDEX admin_quick_replies_owner_idx
  ON admin_quick_replies (created_by_user_id, sort_order, id);
