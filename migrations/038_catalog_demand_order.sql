-- Re-order the public catalog so the services students ask for most sit at the
-- top of /services and the "new request" picker, instead of being buried under
-- the translation / design categories they were seeded in.
--
-- New category order (sort_order): study support and graduation projects lead,
-- then design, formatting, research guidance, translation, tutoring sessions,
-- technical support, and finally the quote-only "extra services" group.
--
-- Data-only, idempotent, forward-only. (packages/catalog/src/seed.ts is the
-- dev-only fixture and predates the study-support / projects categories; the
-- numbered migrations remain the production source of truth for the catalog.)

UPDATE service_categories SET sort_order = 10 WHERE slug = 'study-support';
UPDATE service_categories SET sort_order = 20 WHERE slug = 'projects-development';
UPDATE service_categories SET sort_order = 30 WHERE slug = 'design-presentations';
UPDATE service_categories SET sort_order = 40 WHERE slug = 'formatting-review';
UPDATE service_categories SET sort_order = 50 WHERE slug = 'research-guidance';
UPDATE service_categories SET sort_order = 60 WHERE slug = 'translation';
UPDATE service_categories SET sort_order = 70 WHERE slug = 'training-explanation';
UPDATE service_categories SET sort_order = 80 WHERE slug = 'technical-support';
UPDATE service_categories SET sort_order = 90 WHERE slug = 'more-on-request';

-- Inside "study support", lead with assignment review (asked for daily), then
-- subject tutoring, then exam-prep review.
UPDATE services SET sort_order = 10 WHERE slug = 'assignment-guidance';
UPDATE services SET sort_order = 20 WHERE slug = 'subject-tutoring';
UPDATE services SET sort_order = 30 WHERE slug = 'exam-prep-review';

-- Inside "projects & development", lead with graduation-project guidance, then
-- website development, then engineering support.
UPDATE services SET sort_order = 10 WHERE slug = 'project-guidance';
UPDATE services SET sort_order = 20 WHERE slug = 'website-development';
UPDATE services SET sort_order = 30 WHERE slug = 'engineering-support';
