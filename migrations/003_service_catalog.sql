-- Phase 3 service catalog and its explicit authorization grants.
-- This migration is forward-only. Do not edit after it is applied.

CREATE TABLE service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 80),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 2 AND 120),
  description_ar TEXT NOT NULL CHECK (char_length(btrim(description_ar)) BETWEEN 10 AND 2000),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (updated_at >= created_at)
);

CREATE INDEX service_categories_active_sort_idx
  ON service_categories (active, sort_order, name_ar);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL UNIQUE
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 2 AND 100),
  name_ar TEXT NOT NULL CHECK (char_length(btrim(name_ar)) BETWEEN 2 AND 160),
  short_description_ar TEXT NOT NULL
    CHECK (char_length(btrim(short_description_ar)) BETWEEN 10 AND 320),
  description_ar TEXT NOT NULL CHECK (char_length(btrim(description_ar)) BETWEEN 20 AND 10000),
  pricing_model TEXT NOT NULL
    CHECK (pricing_model IN ('FIXED', 'STARTING_FROM', 'QUOTE_REQUIRED', 'FREE')),
  base_price NUMERIC(12, 2) CHECK (base_price IS NULL OR base_price >= 0),
  currency CHAR(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  active BOOLEAN NOT NULL DEFAULT true,
  accepts_files BOOLEAN NOT NULL DEFAULT false,
  max_files SMALLINT NOT NULL DEFAULT 0 CHECK (max_files BETWEEN 0 AND 20),
  max_file_size_bytes BIGINT NOT NULL DEFAULT 0
    CHECK (max_file_size_bytes BETWEEN 0 AND 104857600),
  default_deadline_hours INTEGER
    CHECK (default_deadline_hours IS NULL OR default_deadline_hours BETWEEN 1 AND 17520),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 100000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((base_price IS NULL) = (currency IS NULL)),
  CHECK (
    (accepts_files AND max_files > 0 AND max_file_size_bytes > 0)
    OR (NOT accepts_files AND max_files = 0 AND max_file_size_bytes = 0)
  ),
  CHECK (updated_at >= created_at)
);

CREATE INDEX services_category_active_sort_idx
  ON services (category_id, active, sort_order, name_ar);

INSERT INTO permissions (code, description) VALUES
  ('catalog.read', 'Read the active public service catalog'),
  ('admin.catalog.read', 'Read service catalog administration data'),
  ('admin.catalog.manage', 'Manage the service catalog')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code) VALUES
  ('STUDENT', 'catalog.read'),
  ('ADMIN', 'catalog.read'),
  ('ADMIN', 'admin.catalog.read'),
  ('ADMIN', 'admin.catalog.manage'),
  ('SYSTEM', 'admin.catalog.read'),
  ('SYSTEM', 'admin.catalog.manage')
ON CONFLICT (role_code, permission_code) DO NOTHING;
