-- Attribution for ad campaigns: capture the utm_source / utm_medium /
-- utm_campaign a student's *first* landing carried, so a request created days
-- later can still be traced back to the ad that brought them in (see
-- `apps/web/src/proxy.ts`, which sets a 30-day `itq_utm` cookie on first
-- landing, and `POST /api/student/requests`, which reads it).
--
-- Nullable: only requests that started from a tagged ad link carry a value;
-- everything else (direct visits, WhatsApp, referrals) stays NULL. Length
-- capped defensively — these are copied verbatim from a cookie, never
-- validated against the shared `@itqanak/core` request schema.

ALTER TABLE service_requests
  ADD COLUMN utm_source TEXT,
  ADD COLUMN utm_medium TEXT,
  ADD COLUMN utm_campaign TEXT;

ALTER TABLE service_requests
  ADD CONSTRAINT service_requests_utm_source_length
    CHECK (utm_source IS NULL OR char_length(utm_source) <= 80),
  ADD CONSTRAINT service_requests_utm_medium_length
    CHECK (utm_medium IS NULL OR char_length(utm_medium) <= 80),
  ADD CONSTRAINT service_requests_utm_campaign_length
    CHECK (utm_campaign IS NULL OR char_length(utm_campaign) <= 120);
