-- Bilingual public catalog and an expanded, production-safe service offering.
-- Pricing metadata remains internal; public clients intentionally do not render it.
-- This migration is forward-only. Do not edit after it is applied.

ALTER TABLE service_categories
  ADD COLUMN name_en TEXT,
  ADD COLUMN description_en TEXT;

ALTER TABLE services
  ADD COLUMN name_en TEXT,
  ADD COLUMN short_description_en TEXT,
  ADD COLUMN description_en TEXT;

UPDATE service_categories
SET
  name_en = CASE slug
    WHEN 'translation' THEN 'Translation & language'
    WHEN 'design-presentations' THEN 'Design & presentations'
    WHEN 'formatting-review' THEN 'Formatting & review'
    WHEN 'technical-support' THEN 'Technical support'
    WHEN 'research-guidance' THEN 'Research guidance'
    WHEN 'training-explanation' THEN 'Training & explanation'
    ELSE name_ar
  END,
  description_en = CASE slug
    WHEN 'translation' THEN 'Professional language support for content you own or are authorised to use.'
    WHEN 'design-presentations' THEN 'Clear, polished visual communication built around your own content.'
    WHEN 'formatting-review' THEN 'Document formatting and language review without changing the originality of your work.'
    WHEN 'technical-support' THEN 'Practical diagnosis and guided solutions for technical issues.'
    WHEN 'research-guidance' THEN 'Methodological guidance that helps you develop your own research skills.'
    WHEN 'training-explanation' THEN 'One-to-one explanations and training focused on lasting understanding.'
    ELSE description_ar
  END;

UPDATE services
SET
  name_en = CASE slug
    WHEN 'document-translation' THEN 'Document translation'
    WHEN 'presentation-visual-design' THEN 'Presentation design'
    WHEN 'document-formatting-review' THEN 'Document formatting & review'
    WHEN 'technical-consultation' THEN 'Technical consultation'
    WHEN 'research-method-guidance' THEN 'Research methods guidance'
    WHEN 'guided-learning-session' THEN 'Guided learning session'
    ELSE name_ar
  END,
  short_description_en = CASE slug
    WHEN 'document-translation' THEN 'Clear human translation that preserves meaning and essential formatting.'
    WHEN 'presentation-visual-design' THEN 'A consistent visual system and readable slides for content you provide.'
    WHEN 'document-formatting-review' THEN 'Professional formatting and language review for an existing document.'
    WHEN 'technical-consultation' THEN 'Diagnose a technical issue and receive practical, secure steps to resolve it.'
    WHEN 'research-method-guidance' THEN 'Discuss methodology, research planning and appropriate learning resources.'
    WHEN 'guided-learning-session' THEN 'An interactive explanation of a concept or tool with guided practice.'
    ELSE short_description_ar
  END,
  description_en = CASE slug
    WHEN 'document-translation' THEN 'Human translation of a document supplied by you, including language review and terminology notes. You remain responsible for the academic content and submission.'
    WHEN 'presentation-visual-design' THEN 'A clear visual identity and readable slide design based on content you supply, without creating assessed answers on your behalf.'
    WHEN 'document-formatting-review' THEN 'Styles, headings, visible references and language issues are reviewed in a document you have already written, without adding new research claims or findings.'
    WHEN 'technical-consultation' THEN 'A guided session to identify the cause of a technical problem and explain a safe solution. We never request account passwords.'
    WHEN 'research-method-guidance' THEN 'Educational guidance on planning, choosing a methodology and evaluating sources, without writing the research or producing findings for you.'
    WHEN 'guided-learning-session' THEN 'A focused training session that helps you understand a concept and practise it independently using non-assessed examples.'
    ELSE description_ar
  END;

ALTER TABLE service_categories
  ALTER COLUMN name_en SET NOT NULL,
  ALTER COLUMN description_en SET NOT NULL,
  ADD CONSTRAINT service_categories_name_en_length
    CHECK (char_length(btrim(name_en)) BETWEEN 2 AND 120),
  ADD CONSTRAINT service_categories_description_en_length
    CHECK (char_length(btrim(description_en)) BETWEEN 10 AND 2000);

ALTER TABLE services
  ALTER COLUMN name_en SET NOT NULL,
  ALTER COLUMN short_description_en SET NOT NULL,
  ALTER COLUMN description_en SET NOT NULL,
  ADD CONSTRAINT services_name_en_length
    CHECK (char_length(btrim(name_en)) BETWEEN 2 AND 160),
  ADD CONSTRAINT services_short_description_en_length
    CHECK (char_length(btrim(short_description_en)) BETWEEN 10 AND 320),
  ADD CONSTRAINT services_description_en_length
    CHECK (char_length(btrim(description_en)) BETWEEN 20 AND 10000);

-- Expand each category with a complementary, integrity-safe service. The
-- inserts are idempotent by slug and deliberately carry no public price.
INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'language-editing', 'التحرير والتدقيق اللغوي', 'Language editing & proofreading',
  'تحرير لغوي دقيق يحسّن الوضوح والأسلوب مع الحفاظ على صوت الكاتب ومعناه.',
  'Careful language editing that improves clarity while preserving your voice and meaning.',
  'مراجعة نص أعددته مسبقاً لتحسين سلامة اللغة واتساق المصطلحات وسلاسة القراءة، دون إنشاء المحتوى أو تغيير أفكاره الجوهرية.',
  'Review of text you have already prepared to improve grammar, terminology and readability, without creating the content or changing its core ideas.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 3, 10485760, 48, 20
FROM service_categories WHERE slug = 'translation'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'academic-poster-design', 'تصميم الملصقات والإنفوجرافيك', 'Poster & infographic design',
  'تحويل المحتوى والبيانات المقدمة إلى ملصق أو إنفوجرافيك واضح ومتوازن.',
  'Turn supplied content and data into a clear, balanced poster or infographic.',
  'تنظيم بصري احترافي للمعلومات التي يقدمها الطالب، مع تحسين التسلسل والقراءة دون اختلاق بيانات أو نتائج.',
  'Professional visual organisation of information you provide, improving hierarchy and readability without inventing data or findings.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 5, 10485760, 72, 20
FROM service_categories WHERE slug = 'design-presentations'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'references-formatting', 'تنسيق المراجع والفهارس', 'References & index formatting',
  'تنظيم المراجع والفهارس وفق النمط المطلوب اعتماداً على بيانات المصادر المقدمة.',
  'Organise references and indexes in the required style using source details you provide.',
  'مراجعة اتساق قائمة المراجع والاستشهادات الظاهرة والفهارس وتنسيقها، دون إنشاء مصادر غير موجودة أو التحقق من محتوى لم يُقدم.',
  'Review and format visible citations, reference lists and indexes without inventing sources or validating material that was not supplied.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 4, 10485760, 48, 20
FROM service_categories WHERE slug = 'formatting-review'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'software-guidance', 'إرشاد الأدوات والبرامج', 'Software & tools guidance',
  'شرح عملي لاستخدام أداة أو برنامج وحل العقبات التي تواجهك أثناء التطبيق.',
  'Practical guidance on a tool or application and help resolving issues as you work.',
  'جلسة إرشادية آمنة تشرح خطوات الاستخدام وتساعد على تشخيص الأخطاء دون طلب بيانات دخول أو تنفيذ تقييم أكاديمي نيابة عن الطالب.',
  'A secure guided session explaining the workflow and diagnosing errors without requesting credentials or completing assessed work for you.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 5, 10485760, 24, 20
FROM service_categories WHERE slug = 'technical-support'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'literature-search-strategy', 'استراتيجية البحث عن المصادر', 'Literature search strategy',
  'بناء كلمات مفتاحية وخطة بحث تساعدك على الوصول إلى مصادر مناسبة بنفسك.',
  'Build keywords and a search plan that helps you find appropriate sources independently.',
  'إرشاد لاختيار قواعد البيانات والكلمات المفتاحية ومعايير الفرز وتوثيق مسار البحث، مع بقاء اختيار المصادر وقراءتها وتحليلها مسؤولية الطالب.',
  'Guidance on databases, keywords, screening criteria and search documentation, while source selection, reading and analysis remain your responsibility.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 3, 10485760, 48, 20
FROM service_categories WHERE slug = 'research-guidance'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT
  id, 'concept-review-session', 'جلسة مراجعة المفاهيم', 'Concept review session',
  'مراجعة مركزة للمفاهيم الأساسية مع أسئلة تدريبية وتعقيب فوري.',
  'A focused concept review with practice questions and immediate feedback.',
  'جلسة تعليمية لتثبيت الفهم واكتشاف الفجوات من خلال أمثلة وأسئلة غير تقييمية، دون أداء الاختبار أو الواجب نيابة عن الطالب.',
  'An educational session that strengthens understanding and identifies gaps through non-assessed examples and practice, never taking an exam or assignment for you.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, FALSE, 0, 0, NULL, 20
FROM service_categories WHERE slug = 'training-explanation'
ON CONFLICT (slug) DO NOTHING;
