-- Bilingual, administrator-managed content blocks for the public landing page
-- and the authenticated student dashboard. Content is deliberately plain text
-- with constrained presentation variants: administrators can manage copy
-- without being able to inject executable HTML or script URLs.

CREATE TABLE content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 80),
  target TEXT NOT NULL CHECK (target IN ('LANDING', 'STUDENT_DASHBOARD')),
  variant TEXT NOT NULL CHECK (variant IN ('INFO', 'HIGHLIGHT', 'ANNOUNCEMENT', 'ACTION')),
  title_ar TEXT NOT NULL CHECK (char_length(btrim(title_ar)) BETWEEN 2 AND 160),
  title_en TEXT NOT NULL CHECK (char_length(btrim(title_en)) BETWEEN 2 AND 160),
  body_ar TEXT NOT NULL CHECK (char_length(btrim(body_ar)) BETWEEN 2 AND 4000),
  body_en TEXT NOT NULL CHECK (char_length(btrim(body_en)) BETWEEN 2 AND 4000),
  action_label_ar TEXT CHECK (
    action_label_ar IS NULL OR char_length(btrim(action_label_ar)) BETWEEN 2 AND 80
  ),
  action_label_en TEXT CHECK (
    action_label_en IS NULL OR char_length(btrim(action_label_en)) BETWEEN 2 AND 80
  ),
  action_href TEXT CHECK (
    action_href IS NULL
    OR (
      char_length(action_href) BETWEEN 1 AND 1000
      AND (
        action_href ~ '^/[A-Za-z0-9][A-Za-z0-9_./?%&=#-]*$'
        OR (
          action_href ~ '^https://[^[:space:]]+$'
          AND action_href !~ '^https://[^/[:space:]]*@'
        )
      )
    )
  ),
  active BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deleted_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  CHECK (
    (action_label_ar IS NULL AND action_label_en IS NULL AND action_href IS NULL)
    OR (action_label_ar IS NOT NULL AND action_label_en IS NOT NULL AND action_href IS NOT NULL)
  ),
  CHECK (deleted_at IS NULL OR active = false),
  CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX content_blocks_live_slug_idx
  ON content_blocks (slug)
  WHERE deleted_at IS NULL;

CREATE INDEX content_blocks_published_target_sort_idx
  ON content_blocks (target, sort_order, created_at, id)
  WHERE active = true AND deleted_at IS NULL;

CREATE INDEX content_blocks_admin_updated_idx
  ON content_blocks (updated_at DESC, id)
  WHERE deleted_at IS NULL;

CREATE TABLE content_block_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_block_id UUID NOT NULL REFERENCES content_blocks(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('CREATED', 'UPDATED', 'VISIBILITY_CHANGED', 'DELETED')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  version INTEGER NOT NULL CHECK (version >= 1),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX content_block_events_block_occurred_idx
  ON content_block_events (content_block_id, occurred_at DESC, id DESC);

CREATE FUNCTION reject_content_block_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'content block event history is append-only';
END;
$$;

CREATE TRIGGER content_block_events_append_only
BEFORE UPDATE OR DELETE ON content_block_events
FOR EACH ROW EXECUTE FUNCTION reject_content_block_event_mutation();

CREATE TRIGGER content_block_events_reject_truncate
BEFORE TRUNCATE ON content_block_events
FOR EACH STATEMENT EXECUTE FUNCTION reject_content_block_event_mutation();

INSERT INTO permissions (code, description) VALUES
  ('admin.content.read', 'Read managed content administration data'),
  ('admin.content.manage', 'Create, update, hide, publish, and delete managed content')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('ADMIN', 'admin.content.read'),
  ('ADMIN', 'admin.content.manage'),
  ('SYSTEM', 'admin.content.read'),
  ('SYSTEM', 'admin.content.manage')
ON CONFLICT (role_code, permission_code) DO NOTHING;
