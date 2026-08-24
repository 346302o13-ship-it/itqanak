# ضوابط التشغيل الآمنة

توفر المنصة تحكمين محدودين ومدققين من صفحة **التشغيل والصيانة** في مركز الإدارة:

1. وضع صيانة للصفحات العامة برسالتين عربية وإنجليزية.
2. إيقاف أو استئناف ClamAV فعليًا لتحرير ذاكرته، مع تعليق طابور الفحص بأمان.

لا يملك Web أو Worker Docker socket، ولا ينفذ أي منهما أوامر حاويات، ولا يعمل بصلاحيات
root. تكتب الواجهة الحالة المطلوبة في PostgreSQL فقط. تنفذ وحدة systemd معزولة على
المضيف المطابقة الفعلية مع حاوية `clamav` ثم تسجل الحالة المرصودة في قاعدة البيانات.

## مصدر الحالة والتدقيق

ينشئ `017_platform_operational_controls.sql` صف singleton في
`platform_operational_settings`. كل تحديث:

- يحتاج صلاحية `admin.operations.manage` وجلسة ADMIN وCSRF وorigin موثوقين؛
- يستخدم optimistic version حتى لا يكتب مدير فوق تغيير أحدث؛
- يحتاج تأكيدًا صريحًا إذا كانت النتيجة تفعيل الصيانة أو إيقاف طابور الفحص؛
- ينشئ حدثًا تلقائيًا في سجل append-only
  `platform_operational_setting_events`؛
- ينشئ أيضًا `PLATFORM_OPERATIONAL_SETTINGS_UPDATED` في سجل التدقيق الأمني، من دون
  نسخ نص الرسالة إلى metadata السجل الأمني.

الدور `itqanak_runtime` — إن كان مُنشأً خارج الترحيلات — يقرأ الصف، ولا يملك إلا تحديث
أعمدة الحالة المطلوبة والنسخة وهوية المدير. لا يمكنه تحديث أعمدة الحالة المرصودة، أو
إدراج singleton آخر أو حذفه، أو إدراج أحداث السجل التشغيلي أو تعديلها. تحديث المضيف
للحالة المرصودة ينشئ حدث `FILE_SCANNER_STATE_OBSERVED` تلقائيًا ولا يغير نسخة إعداد
المدير.

## دمج بوابة الصيانة في Next Proxy

منطق البوابة مستقل في `apps/web/src/lib/maintenance-gate.ts` حتى يمكن دمجه مع طبقة
Cloudflare Access من دون خلط المسؤوليتين. بعد تثبيت المضيف القانوني واستخراج `pathname`
استدعِ:

```ts
const maintenance = await maintenanceResponseForRequest({
  pathname,
  hostname: requestHostname(request),
  adminHostname: adminUrl.hostname,
});
if (maintenance !== undefined) return maintenance;
```

استورد `maintenanceResponseForRequest` من `@/lib/maintenance-gate`. يجب أن يظل هذا
الاستدعاء قبل عرض صفحة عامة، وألا يستبدل تحقق Cloudflare Access الخاص بمضيف الإدارة.
الدالة نفسها تستثني فقط:

- مضيف الإدارة كاملًا؛
- `/api/admin`؛
- `/api/health/live` و`/api/health/ready`.

يخضع `/` وكل مسار `/ar` أو `/en` وكل API عام/طالب/مصادقة على المضيف العام. تُرجع
صفحات المتصفح HTML محمية ومترجمة بحالة `503` و`Retry-After: 60` و`no-store/noindex`،
بينما تعيد مسارات `/api` جسم JSON محدودًا بالحالة نفسها بدل HTML.
نص المدير يُعامل كنص عادي ويُهرب قبل إدخاله إلى HTML. قرار الصيانة مخزن مؤقتًا لكل
عملية Web لمدة `OPERATIONAL_STATE_CACHE_TTL_MS` (الافتراضي ثانيتان، والمسموح
250–10000 مللي ثانية). فشل قراءة الحالة **يفتح الصفحات العامة** ولا يخفي الإدارة؛ تكشف
readiness عطل قاعدة البيانات ويظل المشغل قادرًا على التشخيص.

## المطابقة الفعلية وإخلاء الذاكرة

عند الإيقاف، يقرأ Worker الحالة المطلوبة قبل المطالبة بمهمة جديدة ويتجاوز
`AttachmentScanProcessor.processBatch`. في الدورة التالية ينفذ
`itqanak-clamav-reconciler.service` أمرًا محددًا هو `docker compose stop clamav`، ثم
لا يسجل `STOPPED` إلا بعد التأكد من عدم وجود حاوية ClamAV عاملة. بذلك تُحرر ذاكرة
المحرك فعليًا. الملفات التي كانت `PENDING_SCAN` قبل الإيقاف لا يعاد تصنيفها، بينما
الملفات الجديدة أثناء الإيقاف تستخدم حالة provenance مستقلة:

- يبقى العمل القديم `PENDING_SCAN` حتى الاستئناف؛
- يصبح الرفع الجديد `SCAN_SKIPPED_BY_ADMIN` ولا يُنشئ مهمة فحص؛
- يمكن إرسال وتنزيل skipped مع التحذير والتنزيل الإجباري، ولا يُسمح بمعاينة صورة أو
  مستند غير مفحوص؛
- يستمر heartbeat العامل من دون اشتراط ClamAV ما دامت الحالة المطلوبة متوقفة؛
- تستمر مهام البريد/outbox ومصالحة التخزين؛
- الاستئناف يشغل الحاوية من المضيف، ينتظر Docker health حتى `healthy`، يسجل `RUNNING`،
  ثم يسمح Worker بالمطالبة بالمهام في دورة العامل التالية.

تعرض صفحة الإدارة الحالة المرصودة الآمنة مع جاهزية المحرك. عندما تكون الرغبة `paused`
يعيد readiness إما `paused-stopped` بعد تأكيد مشغل المضيف، أو
`disabled-by-admin` أثناء انتظار أول مشاهدة؛ وكلتاهما حالة جاهزة لأن Web وWorker لا
يعتمدان على المحرك في وضع الإيقاف. عند طلب التشغيل، يظل ClamAV مطلوبًا ويعيد غيابه
`unavailable` و503، ولا يطالب Worker بالمهام حتى يسجل المشغل `RUNNING`. لا تعرض الواجهة
المضيف أو المنفذ أو الاستثناءات أو signatures.

أزيل اعتماد بدء Web وWorker على `clamav`، ووُضعت خدمة ClamAV الإنتاجية داخل profile
`antivirus` كي لا تبدأ أصلًا مع Compose العادي. يشغل reconciler الخدمة المحددة عبر ذلك
الـprofile فقط عند طلب المدير. تبقى حالة skipped ظاهرة ولا تُعاد فهرستها أو فحصها عند
التشغيل إلا من إجراء إداري منفصل صريح.

## تثبيت مشغل المضيف (لا ينفذ تلقائيًا)

الوحدة الجاهزة في `infra/systemd` لا تُفعّل من التطبيق أو أثناء build. ثبّتها كـroot
مرة واحدة، مع إبقاء السكربت root-owned وغير قابل للكتابة من حساب الخدمة:

```bash
sudo install -o root -g root -m 0555 \
  scripts/reconcile-clamav.sh /usr/local/libexec/itqanak-reconcile-clamav
sudo install -o root -g root -m 0644 \
  infra/systemd/itqanak-clamav-reconciler.service \
  infra/systemd/itqanak-clamav-reconciler.timer /etc/systemd/system/
sudo install -d -o root -g root -m 0700 /etc/itqanak
sudo install -o root -g root -m 0600 \
  infra/systemd/itqanak-clamav-reconciler.env.example \
  /etc/itqanak/clamav-reconciler.env
sudo systemctl daemon-reload
sudo systemctl enable --now itqanak-clamav-reconciler.timer
```

ملف المثال مضبوط صراحةً لتخطيط هذا المضيف الحالي: المستودع في `/root/itqanak` وملف
Compose في `/root/itqanak/compose.production.yaml` وبيئة النشر في
`/root/itqanak/.env.production`. يعمل المشغّل كـroot داخل وحدة `oneshot` مقيدة لأن
Docker socket يعادل صلاحية root؛ وبذلك لا نمنح حساب النشر أو Web أو Worker عضوية
مجموعة Docker، ولا نركب `/var/run/docker.sock` في أي حاوية. تجعل الوحدة `/root`
مرئيًا للقراءة فقط (`ProtectHome=read-only`) وتستخدم `/` كدليل عمل محايد، بينما يبقى
ملف إعداد المشغّل mode 0600 والسكربت والوحدة root-owned. الوحدة بلا capabilities
وبقيود systemd، وينفذ السكربت فقط على خدمتي Compose المسميتين `postgres` و`clamav`.
يمكن ضبط مسار Compose/اسم المشروع والمهل في `/etc/itqanak/clamav-reconciler.env`:

```text
ITQANAK_COMPOSE_FILE=/root/itqanak/compose.production.yaml
ITQANAK_COMPOSE_ENV_FILE=/root/itqanak/.env.production
ITQANAK_COMPOSE_PROJECT_NAME=itqanak
CLAMAV_RECONCILE_TIMEOUT_SECONDS=300
CLAMAV_RECONCILE_POLL_SECONDS=3
```

ملف `ITQANAK_COMPOSE_ENV_FILE` هو ملف إعداد نشر Compose القائم نفسه (مسارات الأسرار
والقيم غير السرية)، ويجب أن يبقى mode 0640 أو أشد وألا يحتوي كلمات مرور مباشرة. المشغل
يقرأ الرغبة ويسجل المشاهدة عبر أمر SQL ثابت داخل حاوية PostgreSQL؛ لا يحتاج سر قاعدة
بيانات على المضيف ولا يمرر أسرارًا في command line. يفشل مغلقًا: إن تعذر قراءة الرغبة
لا يغير حالة ClamAV، ويسجل systemd الفشل ليعيد المحاولة في الدورة التالية.

## النشر والتحقق

لا تغيّر حالة إنتاج قبل تطبيق migration 017 وبناء Web وWorker معًا. في إصدار منخفض
المخاطر:

1. خذ نسخة احتياطية محققة وشغّل migrator وحده؛ ثم نفّذ `pnpm db:verify`.
2. ثبّت سكربت/وحدتي systemd وملف البيئة root-owned ثم انشر Web وWorker من artifact
   واحد؛ لا تركب Docker socket ولا تضف capabilities إلى الحاويات.
3. بعد نجاح migration 020 وقبل `compose up` العادي، نفّذ
   `sudo systemctl start itqanak-clamav-reconciler.service`. هذه الخطوة مهمة في أول
   نشر للـprofile: فهي توقف حاوية `clamav` القديمة إن كانت ما تزال عاملة؛ فـCompose
   لا يوقف تلقائيًا خدمة profile كانت موجودة من إصدار سابق. تحقق من تسجيل `STOPPED`
   ومن أن `docker compose --profile antivirus ... ps --status running clamav` لا يعيد
   حاوية، ثم فعّل timer. لا تستخدم `down --remove-orphans` في هذا المسار.
4. تحقق من `/api/health/live` ثم `/api/health/ready` ومن heartbeat العامل.
5. ادخل إلى مضيف الإدارة وافتح `/ar/admin/operations` أو `/en/admin/operations`.
6. في نافذة اختبار، فعّل الصيانة برسالة غير حساسة وتأكد من 503 على المضيف العام، ومن
   بقاء الإدارة وhealth متاحتين، ثم ألغها.
7. والفحص متوقف، ارفع ملف اختبار غير حساس وتأكد من `SCAN_SKIPPED_BY_ADMIN` ومن إمكان
   تنزيله كـattachment مع Warning وعدم معاينة صورته inline. ثم شغّل الفحص وارفع ملفًا
   آخر وتأكد من `PENDING_SCAN` ثم `CLEAN`، وبقاء الملف الأول skipped دون إعادة فحص.

لا تعدل صف الإعدادات يدويًا في الإنتاج؛ استخدم واجهة الإدارة حتى يُسجل actor ونسخة
التغيير وسياق الطلب. لا تعتبر توقف الطابور بديلاً عن عزل محرك مصاب أو إجراء استجابة
حادث على المضيف.
