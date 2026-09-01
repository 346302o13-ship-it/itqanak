-- Lower every published starting price to a token amount, and add a "more
-- services, on request" category whose services carry no price and are meant to
-- be discussed in the conversation. Data-only, idempotent, forward-only.

UPDATE services SET base_price = 30.00 WHERE slug = 'document-translation';
UPDATE services SET base_price = 15.00 WHERE slug = 'language-editing';
UPDATE services SET base_price = 40.00 WHERE slug = 'presentation-visual-design';
UPDATE services SET base_price = 25.00 WHERE slug = 'academic-poster-design';
UPDATE services SET base_price = 25.00 WHERE slug = 'document-formatting-review';
UPDATE services SET base_price = 15.00 WHERE slug = 'references-formatting';
UPDATE services SET base_price = 20.00 WHERE slug = 'technical-consultation';
UPDATE services SET base_price = 15.00 WHERE slug = 'software-guidance';
UPDATE services SET base_price = 25.00 WHERE slug = 'research-method-guidance';
UPDATE services SET base_price = 20.00 WHERE slug = 'literature-search-strategy';
UPDATE services SET base_price = 40.00 WHERE slug = 'guided-learning-session';
UPDATE services SET base_price = 20.00 WHERE slug = 'concept-review-session';
UPDATE services SET base_price = 15.00 WHERE slug = 'subject-tutoring';
UPDATE services SET base_price = 20.00 WHERE slug = 'exam-prep-review';
UPDATE services SET base_price = 20.00 WHERE slug = 'assignment-guidance';
UPDATE services SET base_price = 30.00 WHERE slug = 'project-guidance';
UPDATE services SET base_price = 60.00 WHERE slug = 'website-development';
UPDATE services SET base_price = 25.00 WHERE slug = 'engineering-support';

INSERT INTO service_categories (slug, name_ar, name_en, description_ar, description_en, sort_order, active)
VALUES (
  'more-on-request',
  'خدمات إضافية بالاستفسار',
  'More services, on request',
  'خدمات إضافية يُحدَّد سعرها ونطاقها بعد الاستفسار في المحادثة. صف احتياجك وسنوضح إن كنا نستطيع المساعدة وكيف.',
  'Extra services whose price and scope are agreed after a quick chat. Describe what you need and we will say whether and how we can help.',
  90,
  TRUE
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'custom-request', 'طلب خدمة غير مدرجة', 'A service not listed here',
  'لديك احتياج لا يظهر في القائمة؟ صف ما تريده وسنوضح إن كنا نستطيع المساعدة وكيف.',
  'Need something that is not on the list? Describe it and we will tell you whether and how we can help.',
  'أرسل وصفًا مختصرًا لما تحتاجه؛ نراجعه ونرد عليك في المحادثة بنطاق العمل والسعر التقريبي قبل أي التزام. تبقى النزاهة الأكاديمية شرطًا: لا أداء اختبار أو واجب مقيَّم نيابةً عنك.',
  'Send a short description of what you need. We review it and reply in the conversation with the scope and an approximate price before any commitment. Academic integrity still applies: no sitting a graded assignment or exam for you.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 5, 10485760, NULL, 10
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'cv-resume', 'إعداد السيرة الذاتية', 'CV & resume preparation',
  'صياغة سيرة ذاتية واضحة واحترافية من معلوماتك مع تحسين الترتيب واللغة.',
  'A clear, professional CV built from your information, with better structure and wording.',
  'نحوّل معلوماتك (الخبرات والمهارات والتعليم) إلى سيرة ذاتية منظمة وسهلة القراءة، مع مراجعة اللغة والتنسيق. المحتوى والحقائق تبقى مسؤوليتك.',
  'We turn your information (experience, skills, education) into a well-organised, readable CV with language and formatting review. The content and facts remain your responsibility.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 3, 10485760, 48, 20
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'transcription', 'التفريغ الصوتي والنصي', 'Audio & text transcription',
  'تحويل تسجيل صوتي أو مرئي إلى نص منسّق ومراجَع.',
  'Turn an audio or video recording into a formatted, reviewed transcript.',
  'تفريغ دقيق لتسجيلاتك إلى نص مكتوب مع تنسيق واضح ومراجعة لغوية أساسية. لا نضيف محتوى أو تحليلًا لم يرد في التسجيل.',
  'Accurate transcription of your recordings into written text with clear formatting and basic language review. We do not add content or analysis that was not in the recording.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 5, 10485760, 72, 30
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'data-analysis-guidance', 'إرشاد تحليل البيانات', 'Data analysis guidance',
  'شرح وتوجيه لطرق وأدوات تحليل بياناتك خطوة بخطوة.',
  'A step-by-step explanation of methods and tools for analysing your data.',
  'نشرح لك كيف تختار الأسلوب الإحصائي المناسب وتستخدم الأداة (مثل Excel أو SPSS أو Python) على بياناتك بنفسك، مع مراجعة نتائجك. لا ننتج تحليلًا مقيَّمًا نيابةً عنك.',
  'We explain how to choose an appropriate statistical approach and use the tool (Excel, SPSS, Python, …) on your own data, and we review your results. We do not produce a graded analysis for you.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 5, 10485760, 72, 40
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'presentation-coaching', 'تدريب على العرض والإلقاء', 'Presentation & delivery coaching',
  'جلسة تدريب على تقديم عرضك بثقة: البنية والإيقاع والتعامل مع الأسئلة.',
  'A coaching session to deliver your presentation with confidence: structure, pacing and Q&A.',
  'نتدرب معك على إلقاء عرضك أمام الجمهور: ترتيب الأفكار، لغة الجسد، إدارة الوقت، والرد على الأسئلة، مع ملاحظات عملية للتحسين.',
  'We rehearse your presentation with you: ordering ideas, body language, time management and handling questions, with practical notes to improve.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 3, 10485760, 48, 50
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'similarity-report-guidance', 'فحص التشابه وضبط الاقتباس', 'Similarity check & citation guidance',
  'فحص نسبة التشابه في مستندك وشرح التقرير وكيفية تحسين الاقتباس والإسناد.',
  'A similarity check on your document, an explanation of the report and how to fix citations.',
  'نجري فحص تشابه لمستندك الذي أعددته ونشرح لك التقرير: ما الذي يجب إعادة صياغته، وكيف تُسند المصادر بشكل صحيح، لتقليل التشابه بنزاهة. لا نعيد كتابة العمل نيابةً عنك.',
  'We run a similarity check on the document you wrote and explain the report: what to paraphrase and how to cite sources correctly to reduce similarity with integrity. We do not rewrite the work for you.',
  'QUOTE_REQUIRED', NULL, NULL, TRUE, TRUE, 3, 10485760, 48, 60
FROM service_categories WHERE slug = 'more-on-request'
ON CONFLICT (slug) DO NOTHING;
