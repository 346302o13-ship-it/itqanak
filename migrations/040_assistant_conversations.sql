-- Persists the AI assistant's conversation turns per user (student or admin),
-- the same way every other conversation in this platform is persisted —
-- previously the assistant only held history in the browser, so it reset on
-- every page reload. One row per turn, storing the same Gemini `role`+`parts`
-- shape already used end-to-end (packages/ai's GeminiContent), so a
-- conversation can be replayed straight back into the model with no
-- transformation. Visitors (unauthenticated) still cannot persist — there is
-- no user_id to key by, and that surface has no database access anyway.

CREATE TABLE assistant_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'model')),
  parts JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assistant_messages_user_id_created_at_idx
  ON assistant_messages (user_id, created_at, id);
