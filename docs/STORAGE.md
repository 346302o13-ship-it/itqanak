# التخزين الخاص

يحفظ PostgreSQL metadata وحالات المرفق فقط. تحفظ البايتات خلف port باسم
`ObjectStorage` يدعم `put`, `open`, `signDownload`, `exists`, و`remove`، ويطلب من المستدعي
المفتاح بدل توليده من اسم الملف.

## مفاتيح الكائنات

تنشأ مفاتيح الطلبات بالشكل:

```text
requests/{requestId}/{attachmentId}/{32-hex-random}
```

يتحقق المصنع من UUIDs، ويرفض adapter المفتاح المطلق أو غير normalized أو المحتوي على
backslash أو NUL أو مقطع فارغ أو `.` أو `..`. الاسم الأصلي metadata في قاعدة البيانات ولا
يظهر في key ولا يرسل إلى logs.

## Local development

`STORAGE_DRIVER=local` هو الوضع الافتراضي للتطوير. يجب أن يكون
`STORAGE_LOCAL_PATH` مسارًا مطلقًا آمنًا وليس `/`، وخارج شجرة Web العامة. تنشئ الأدلة
بصلاحية `0700` والملفات بـ`0600`، وتستخدم كتابة `wx` لمنع overwrite. تشترك Web وWorker
في volume خاص `private-uploads` داخل Compose.

لا يصدر local adapter رابطًا عامًا؛ يفتح التطبيق الملف بعد التفويض ويبثه للعميل. Local
ليس backend إنتاجيًا.

## S3-compatible production

`STORAGE_DRIVER=s3` يتطلب region وbucket خاصًا وaccess key وsecret key. endpoint اختياري
لدعم مزود متوافق مع S3، لكنه يجب أن يستخدم HTTPS في production إن ضبط. يدعم
`STORAGE_S3_FORCE_PATH_STYLE` لمزودات التطوير مثل MinIO. تصل بيانات الاعتماد الإنتاجية
من ملفات Docker secrets عبر config resolver ولا تدخل `.env.example` أو Compose بقيمها.

لا يحدد adapter public ACL، ويخزن `Content-Type` كـ`application/octet-stream`. يدعم
رابط تنزيل موقعًا لمدة 300 ثانية افتراضيًا وبحد أقصى 900، لكن route الطالب الحالي يفتح
الجسم ويبثه بعد فحص الملكية وحالة scan؛ لا يعرض bucket أو key.

كل عملية شبكة S3 فعلية (`PUT`, `GET`, `HEAD`, `DELETE`) تحمل مهلة مطلقة افتراضية خمس
دقائق، ولا يسمح adapter بإعداد يتجاوز ثلاثين دقيقة. يبقى ذلك أقل بوضوح من lease مصالحة
`PENDING_UPLOAD` البالغ ساعة، فلا يستطيع PUT عالق أن يتجاوز زمن اعتبار الحجز منقطعًا.

MinIO موجود للتجربة تحت profile `storage` فقط، ولا يبدأ مع Compose اليومي. عند تفعيله، تنشئ
خدمة `minio-init` الـbucket الخاص المحدد في `STORAGE_S3_BUCKET` (أو
`itqanak-private` افتراضيًا) بصورة idempotent وتؤكد تعطيل الوصول المجهول. شغّل profile
بعد ضبط بيانات اعتماد تطوير غير ملتزمة بالمستودع:

```bash
export MINIO_ROOT_USER=local-itqanak
export MINIO_ROOT_PASSWORD='development-only-long-password'
export STORAGE_S3_BUCKET=itqanak-private
docker compose --profile storage up -d --wait minio
docker compose --profile storage run --rm minio-init
```

خروج `minio-init` بالرمز صفر شرط لاختبار S3 على volume جديدة؛ صحة خدمة MinIO وحدها لا تثبت وجود
الـbucket. لا تجعل بيانات MinIO المحلية بديلًا عن bucket الإنتاج الخارجي أو النسخ خارج
الخادم.

## Streaming والنزاهة

يمر الجسم عبر Transform يحسب SHA-256 ويعد البايتات أثناء الكتابة. تفشل العملية إذا تجاوز
الجسم `Content-Length` المعلن أو انتهى قبله، ولا تعاد البصمة قبل اكتمال stream. لا يخزن
Local أو S3 الجسم كاملًا في RAM. البصمة تكشف اختلاف البايتات وليست دليلًا على خلو الملف
من البرمجيات الضارة.

`exists()` يعيد false فقط عند غياب محدد: `ENOENT` محليًا، أو NotFound/NoSuchKey/HTTP 404
في S3. أخطاء الصلاحيات والشبكة تنتشر ولا تتحول إلى «مفقود»، حتى لا تمحو المصالحة metadata
عند عطل مؤقت.

## حدود المعاملة والتعويض

لا توجد معاملة ACID تجمع PostgreSQL وLocal/S3. الرفع Saga واضحة:

```text
DB PENDING_UPLOAD -> object put -> DB STORED
```

- فشل `put` يحول الصف إلى `UPLOAD_FAILED`.
- نجاح `put` ثم فشل إنهاء DB يحاول حذف المفتاح المحدد ويترك الصف قابلًا للمصالحة.
- الحذف يحول DB أولًا إلى `DELETE_PENDING` ثم يحذف الجسم ثم يثبت `DELETED`.
- فشل الحذف لا يحول 403 أو timeout إلى نجاح.

الأحداث والتدقيق وتحديث metadata داخل PostgreSQL transactional، لكن الكائن الخارجي يعتمد
على compensation وعمليات idempotent ومصالحة لاحقة. لا تصف هذا المسار بأنه exactly-once.

## أدوات التحقق والمصالحة

```bash
pnpm storage:verify
pnpm storage:cleanup-orphans
pnpm storage:cleanup-orphans -- --execute --limit=20
```

- `storage:verify` يفحص وجود عينة حتى 200 كائن `STORED` مرجعيًا. خطأ الشبكة/403 يفشل
  الأمر؛ لا يحسبه missing.
- `storage:cleanup-orphans` افتراضيًا dry-run ويعرض صفوف `UPLOAD_FAILED` و
  `DELETE_PENDING` الأقدم من خمس دقائق، وكذلك `PENDING_UPLOAD` المنقطعة الأقدم من
  ساعة واحدة.
- `--execute` يعالج دفعة bounded من 1 إلى 20 ويحذف فقط مفتاحًا موجودًا أصلًا في صف DB.
  لا يسرد bucket ولا يخمن prefixes ولا يحذف كائنًا غير مرجعي.
- العامل ينفذ مصالحة صغيرة دوريًا. تستخدم المطالبات `SKIP LOCKED` لتجنب سباق عمال متعددين
  أو foreground upload/delete.

اسم أمر cleanup تاريخي؛ وظيفته الحالية مصالحة حالات DB المرجعية، لا garbage collection
شاملة لكل bucket. أي أداة مستقبلية للكائنات غير المرجعية تحتاج inventory وretention
وحماية dry-run وموافقة منفصلة.

## النسخ والاستعادة

نسخة PostgreSQL وحدها لا تحتوي أجسام المرفقات. يجب أن تنسخ بيئة الإنتاج bucket الخاص
خارج الخادم بسياسة provider، وأن تختبر استعادة DB والكائنات معًا ثم تشغل `storage:verify`.
لا تنسخ volume التطوير المحلي إلى production ولا تعتبر ملفًا غير مفحوص `CLEAN`.
