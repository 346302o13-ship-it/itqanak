-- Two new integrity-safe categories (study support, projects & development) and
-- six new services, plus a very modest public "starting from" price on every
-- service that was previously quote-only. Data-only and idempotent by slug:
-- re-running changes nothing. This migration is forward-only.

INSERT INTO service_categories (slug, name_ar, name_en, description_ar, description_en, sort_order, active)
VALUES
  (
    'study-support',
    'الدراسة والدعم الأكاديمي',
    'Study & academic support',
    'شرح ومراجعة وتغذية راجعة تساعدك على فهم مادتك وإنجاز عملك بنفسك، دون أداء واجب مقيَّم أو اختبار نيابةً عنك.',
    'Explanation, review and feedback that help you understand your material and do your own work — never sitting a graded assignment or exam for you.',
    70,
    TRUE
  ),
  (
    'projects-development',
    'المشاريع والتطوير',
    'Projects & development',
    'إرشاد وبناء ومراجعة للمشاريع والمواقع والحلول التقنية، مع بقاء العمل الأكاديمي المقيَّم ومسؤوليته لك.',
    'Guidance, building and review for projects, websites and technical solutions, while any assessed academic work stays your responsibility.',
    80,
    TRUE
  )
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'subject-tutoring', 'شرح المواد الدراسية', 'Subject tutoring',
  'جلسة شرح تفاعلية لأي مادة أو موضوع دراسي بأسلوب مبسّط يركّز على الفهم.',
  'An interactive tutoring session on any subject or topic, focused on understanding.',
  'شرح مبسّط ومنظّم لمفاهيم مادتك مع أمثلة وتمارين توضيحية، لتبني فهمًا مستقلًا. لا نحل واجبًا مقيَّمًا ولا نؤدي اختبارًا نيابةً عنك.',
  'A clear, structured explanation of your course concepts with worked examples so you build independent understanding. We do not complete graded assignments or take exams for you.',
  'STARTING_FROM', 25.00, 'SAR', TRUE, TRUE, 3, 10485760, 24, 10
FROM service_categories WHERE slug = 'study-support'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'exam-prep-review', 'مراجعة ما قبل الاختبار', 'Pre-exam review',
  'جلسة مراجعة مركّزة للمادة قبل الاختبار مع أسئلة تدريبية للفهم.',
  'A focused review of the material before your exam, with practice questions for understanding.',
  'نراجع معك محتوى المادة ونتدرب على نماذج أسئلة للفهم والاستعداد. لا نقدّم إجابات اختبار جارٍ ولا نؤدي الاختبار نيابةً عنك.',
  'We review the course content with you and practise sample questions for understanding and readiness. We never provide answers to a live exam or sit it for you.',
  'STARTING_FROM', 35.00, 'SAR', TRUE, TRUE, 3, 10485760, 24, 20
FROM service_categories WHERE slug = 'study-support'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'assignment-guidance', 'إرشاد ومراجعة الواجبات', 'Assignment guidance & review',
  'توجيه لطريقة إنجاز واجبك ومراجعة لما كتبته مع تغذية راجعة واضحة.',
  'Guidance on how to approach your assignment and a review of the draft you wrote, with clear feedback.',
  'نوضّح لك كيف تقارب الواجب ونراجع مسودتك التي أعددتها ونشير إلى مواطن التحسين. لا نحل الواجب المقيَّم نيابةً عنك.',
  'We explain how to approach the assignment and review the draft you prepared, pointing out where to improve. We do not complete the graded assignment for you.',
  'STARTING_FROM', 30.00, 'SAR', TRUE, TRUE, 5, 10485760, 48, 30
FROM service_categories WHERE slug = 'study-support'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'project-guidance', 'إرشاد مشاريع التخرج والمقررات', 'Graduation & course project guidance',
  'توجيه منهجي لخطة مشروعك ومراحله ومراجعة مخرجاتك.',
  'Methodical guidance for your project plan and stages, with a review of your deliverables.',
  'نساعدك على تخطيط مشروع التخرج أو مشروع المقرر واختيار المنهجية ومراجعة ما تنجزه، دون كتابة المشروع أو إنتاج نتائجه نيابةً عنك.',
  'We help you plan your graduation or course project, choose a methodology and review your deliverables — without writing the project or producing its results for you.',
  'STARTING_FROM', 45.00, 'SAR', TRUE, TRUE, 5, 10485760, 72, 10
FROM service_categories WHERE slug = 'projects-development'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'website-development', 'تطوير المواقع الإلكترونية', 'Website development',
  'بناء موقع أو صفحة هبوط أو معرض أعمال، أو إرشادك لتطويره بنفسك.',
  'Build of a website, landing page or portfolio, or coaching so you build it yourself.',
  'تصميم وبرمجة موقع إلكتروني لأغراضك الشخصية أو التدريبية، أو جلسات إرشاد لتطويره بنفسك. إن كان مشروعًا دراسيًا مقيَّمًا فدورنا يقتصر على الإرشاد والمراجعة.',
  'Design and build of a website for your personal or practice use, or coaching sessions so you build it yourself. If it is an assessed coursework project, our role is limited to guidance and review.',
  'STARTING_FROM', 120.00, 'SAR', TRUE, TRUE, 5, 10485760, 120, 20
FROM service_categories WHERE slug = 'projects-development'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO services (
  category_id, slug, name_ar, name_en, short_description_ar, short_description_en,
  description_ar, description_en, pricing_model, base_price, currency, active,
  accepts_files, max_files, max_file_size_bytes, default_deadline_hours, sort_order
)
SELECT id, 'engineering-support', 'الدعم الهندسي', 'Engineering support',
  'شرح وتوجيه لمسائل ورسومات وحسابات هندسية بخطوات مفهومة.',
  'A step-by-step explanation for engineering problems, drawings and calculations.',
  'نشرح لك طريقة التعامل مع مسألة أو رسم أو حساب هندسي خطوةً بخطوة لتنجزه بنفسك. لا نؤدي واجبًا هندسيًا مقيَّمًا نيابةً عنك.',
  'We explain step by step how to tackle an engineering problem, drawing or calculation so you complete it yourself. We do not do a graded engineering assignment for you.',
  'STARTING_FROM', 40.00, 'SAR', TRUE, TRUE, 5, 10485760, 72, 30
FROM service_categories WHERE slug = 'projects-development'
ON CONFLICT (slug) DO NOTHING;

-- Give every remaining quote-only service a very modest public starting price so
-- a student can gauge fit before creating a request. Final price is still set
-- after the team reviews the scope.
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 20.00, currency = 'SAR'
  WHERE slug = 'language-editing' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 45.00, currency = 'SAR'
  WHERE slug = 'academic-poster-design' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 20.00, currency = 'SAR'
  WHERE slug = 'references-formatting' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 30.00, currency = 'SAR'
  WHERE slug = 'technical-consultation' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 25.00, currency = 'SAR'
  WHERE slug = 'software-guidance' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 40.00, currency = 'SAR'
  WHERE slug = 'research-method-guidance' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 35.00, currency = 'SAR'
  WHERE slug = 'literature-search-strategy' AND pricing_model = 'QUOTE_REQUIRED';
UPDATE services SET pricing_model = 'STARTING_FROM', base_price = 30.00, currency = 'SAR'
  WHERE slug = 'concept-review-session' AND pricing_model = 'QUOTE_REQUIRED';
