# ITQANAK — إتقانك

منصة عربية RTL مبنية بـNext.js وTypeScript وPostgreSQL وRedis وWorker مستقل. اكتملت
المرحلة الثالثة: حسابات وجلسات وصلاحيات المرحلة الثانية، وكتالوج الخدمات، وبوابة الطالب،
وطلبات الخدمات ذات التاريخ المتين والتزامن المتفائل، ومرفقات خاصة مع تخزين Local/S3 وفحص
ClamAV. لا يحتوي المستودع على بيانات طلاب أو أسرار أو تكاملات دفع أو WhatsApp حقيقية.

## المتطلبات

- Node.js 22.23.x
- pnpm 9.15.x عبر Corepack
- Docker Engine مع Docker Compose v2

## البدء محليًا

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/live
curl --fail http://127.0.0.1:8080/api/health/ready
```

يشغل Compose التطويري Web وWorker بوضع المراقبة عبر bind mounts. PostgreSQL وRedis
داخليان ولا ينشران منافذ للمضيف، وgateway وحده يستمع على `127.0.0.1:8080`. ملف `.env`
للتطوير فقط ولا يدخل Git.

الوضع اليومي يستخدم تخزينًا محليًا خاصًا في volume مشترك و
`FILE_SCAN_MODE=disabled`. تعطيل الفحص لا ينتج `CLEAN`؛ تظهر الملفات
`SCAN_SKIPPED_DEVELOPMENT`. لا تستخدم هذه الملفات كبيانات إنتاجية.

لتشغيل ClamAV محليًا، عيّن `FILE_SCAN_MODE=clamav` في `.env` ثم:

```bash
docker compose --profile antivirus up --build -d
```

ClamAV لا يبدأ دون profile ولا تنشر له منافذ. MinIO اختياري تحت profile مستقل للتجربة
مع S3، ويتطلب بيانات اعتماد تطوير محلية غير ملتزمة:

```bash
docker compose --profile storage up -d
```

يمكن جمع `storage` و`antivirus` عند اختبار المسار الكامل. لا تستخدم
`docker compose down -v` إلا إذا كان حذف قاعدة التطوير والملفات الخاصة مقصودًا صراحة.

## قاعدة البيانات والـseed

شغّل أوامر قاعدة البيانات داخل خدمة `migrate` في الإعداد المعزول:

```bash
docker compose run --rm --no-deps migrate pnpm db:migrate
docker compose run --rm --no-deps migrate pnpm db:status
docker compose run --rm --no-deps migrate pnpm db:verify
docker compose run --rm --no-deps migrate pnpm catalog:seed-development
```

Seed الكتالوج idempotent ومخصص لـdevelopment/test ويرفض production. الترحيلات SQL
forward-only في [`migrations`](./migrations)، مع checksums وadvisory lock ومعاملة مستقلة
لكل ملف. راجع [`docs/DATABASE_MIGRATIONS.md`](./docs/DATABASE_MIGRATIONS.md) قبل إضافة
ترحيل.

## الجودة والاختبارات

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm test:smoke
pnpm test:auth-e2e
pnpm test:requests-e2e
```

اختبارات التكامل تغيّر قاعدة البيانات المقصودة. لذلك لا تعمل عند ضبط
`TEST_DATABASE_URL` إلا إذا كانت القاعدة محلية/داخل Compose واسمها يحتوي
`test` أو `ci` أو `e2e`، ومع إقرار صريح
`ITQANAK_INTEGRATION_DATABASE=isolated-test-database`. لا توجّهها مطلقاً إلى
قاعدة التطوير اليومية أو الإنتاج.

اختبارا `auth-e2e` و`requests-e2e` يرفضان التنفيذ قبل أي تسجيل ما لم تكن البوابة
محلية ومملوكة لمشروع Compose مستقل يحتوي اسمه `e2e` أو `test`. استخدم منفذاً خاصاً
عبر `ITQANAK_GATEWAY_HOST_PORT` واضبط `E2E_COMPOSE_PROJECT_NAME` و`COMPOSE_PROJECT_NAME`
على الاسم نفسه؛ إعدادات CI في [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)
هي المرجع القابل للتنفيذ. لا توجّه اختبارات المتصفح إلى نطاق الإنتاج.

اختبار ClamAV الحقيقي opt-in ويحتاج `TEST_CLAMAV_HOST`؛ الاختبارات العادية لا تحتاج
تشغيل antivirus profile.

تجربة S3 المحلية opt-in كذلك. اضبط `MINIO_ROOT_USER` و`MINIO_ROOT_PASSWORD` بقيم تطوير
غير ملتزمة، ثم شغّل `docker compose --profile storage up -d --wait minio` وبعده
`docker compose --profile storage run --rm minio-init`؛ تهيئ الخدمة الـbucket الخاص
بصورة idempotent قبل الاختبار.

## أدوات طلبات وملفات التشغيل

```bash
pnpm requests:cleanup-drafts
pnpm storage:verify
pnpm storage:cleanup-orphans
pnpm storage:cleanup-orphans -- --execute --limit=20
pnpm files:scan-pending
```

تنظيف المسودات تقريري فقط. مصالحة التخزين dry-run افتراضيًا، و`--execute` لا يحذف إلا
مفاتيح مرتبطة بصفوف `UPLOAD_FAILED` أو `DELETE_PENDING` قديمة؛ لا يسرد bucket ولا ينفذ
garbage collection عامًا. اقرأ [`docs/OPERATIONS.md`](./docs/OPERATIONS.md) قبل التنفيذ.

## الإنتاج والأسرار

Compose الإنتاج يفرض `STORAGE_DRIVER=s3` و`FILE_SCAN_MODE=clamav`. اضبط region وbucket
وendpoint HTTPS اختياريًا خارج المستودع، وأنشئ ملفات أسرار محمية للمفاتيح. تشمل مسارات
الأسرار الأساسية:

```text
ITQANAK_DATABASE_URL_SECRET_FILE
ITQANAK_REDIS_URL_SECRET_FILE
ITQANAK_POSTGRES_PASSWORD_SECRET_FILE
ITQANAK_REDIS_PASSWORD_SECRET_FILE
ITQANAK_RUNTIME_DATABASE_URL_SECRET_FILE
ITQANAK_STORAGE_S3_ACCESS_KEY_ID_SECRET_FILE
ITQANAK_STORAGE_S3_SECRET_ACCESS_KEY_SECRET_FILE
```

كل ملف يحتوي قيمة واحدة ويُمرر كـDocker secret. خدمات migrator وعمليات المصادقة لا
تحتاج أسرار S3 أو ClamAV؛ Web وWorker فقط يطلبان تلك القدرات عند تحميل config. إذا فعلت
بريد المصادقة، أضف مفتاح AES-GCM ومفتاح SMTP حسب
[`docs/AUTH_EMAIL.md`](./docs/AUTH_EMAIL.md).

```bash
docker compose -f compose.production.yaml config
docker compose -f compose.production.yaml up -d --build
```

لا تصل Cloudflare أو DNS قبل نجاح migration gate وhealth checks من loopback. gateway فقط
ينشر `127.0.0.1:8080`، وClamAV وPostgreSQL وRedis وWeb وWorker لا تنشر منافذ.

## النسخ والاستعادة

```bash
scripts/backup-postgres.sh
scripts/verify-backup.sh /path/to/backup.dump
```

نسخة PostgreSQL لا تحتوي أجسام المرفقات. يجب حماية bucket الإنتاج ونسخه خارج الخادم
واختبار استعادة metadata والكائنات معًا ثم تشغيل `storage:verify`. راجع
[`docs/BACKUP_RESTORE.md`](./docs/BACKUP_RESTORE.md) و
[`docs/INCIDENT_RECOVERY.md`](./docs/INCIDENT_RECOVERY.md).

## المسارات الحالية

- المصادقة والحساب: `/ar/auth/register`, `/ar/auth/login`, `/ar/account`.
- الكتالوج العام: `/ar/services` و`/ar/services/[slug]`.
- بوابة الطالب: `/ar/student`, `/ar/student/requests`, `/ar/student/requests/new`.
- الإدارة: `/ar/admin` محمية من المرحلة الثانية؛ إدارة الطلبات تأتي في المرحلة الرابعة.

تستخدم الجلسات cookies خادمية `HttpOnly` فقط، ولا توجد JWT في `localStorage`. تمر تنزيلات
المرفقات عبر تفويض التطبيق ولا تكشف مفاتيح التخزين.

## ما بقي

المراحل 4–8 تضيف إدارة الطلبات والتعيين، ثم المحادثة الموحدة، ثم العروض والمالية، ثم
إشعارات المنتج وWhatsApp، ثم CMS والتقارير والتحليلات وتشديد الإنتاج والتعافي. الدفع
والمحادثة وWhatsApp وCloudflare production controls غير منفذة الآن. راجع
[`docs/ROADMAP.md`](./docs/ROADMAP.md) و[`docs/RECOVERED_SCOPE.md`](./docs/RECOVERED_SCOPE.md).

## التوثيق

- [`docs/SERVICE_CATALOG.md`](./docs/SERVICE_CATALOG.md)
- [`docs/SERVICE_REQUESTS.md`](./docs/SERVICE_REQUESTS.md)
- [`docs/REQUEST_STATE_MACHINE.md`](./docs/REQUEST_STATE_MACHINE.md)
- [`docs/FILE_UPLOADS.md`](./docs/FILE_UPLOADS.md)
- [`docs/FILE_SCANNING.md`](./docs/FILE_SCANNING.md)
- [`docs/STORAGE.md`](./docs/STORAGE.md)
- [`docs/STUDENT_PORTAL.md`](./docs/STUDENT_PORTAL.md)
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`docs/AUTHENTICATION.md`](./docs/AUTHENTICATION.md)
