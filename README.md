# ITQANAK — إتقانك

أساس المرحلة الأولى لمنصة إتقانك: Monorepo عربي RTL مبني بـ Next.js وTypeScript
وPostgreSQL وRedis وWorker مستقل. هذا المستودع لا يحتوي على بيانات طلاب أو أسرار أو
تكاملات دفع/WhatsApp حقيقية.

## المتطلبات

- Node.js 22.14.x
- pnpm 9.15.x (Corepack)
- Docker Engine مع Docker Compose v2

## البدء محلياً

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up --build -d
docker compose ps
curl --fail http://127.0.0.1:8080/api/health/live
curl --fail http://127.0.0.1:8080/api/health/ready
```

تستخدم Compose في التطوير bind mounts وتشغّل وضع المراقبة للـWeb والـWorker؛ لذلك
تظهر تعديلات المصدر دون الحاجة إلى تشغيل `pnpm dev` على المضيف. ملف `.env` مخصص
للتطوير فقط ولا يدخل Git. لا تضع قيماً إنتاجية أو أسراراً في `.env.example`.

تعمل قاعدة البيانات المحلية في شبكة Docker داخلية بوضع `trust` للتطوير فقط؛ لا
توجد أي منافذ PostgreSQL أو Redis منشورة على المضيف. لهذا شغّل أوامر قاعدة البيانات
داخل خدمة `migrate` بدلاً من المضيف:

```bash
docker compose run --rm --no-deps migrate pnpm db:migrate
docker compose run --rm --no-deps migrate pnpm db:status
docker compose run --rm --no-deps migrate pnpm db:verify
```

MinIO اختياري ومقيد بملف
تعريف `storage` ويتطلب بيانات اعتماد محلية غير ملتزمة قبل تشغيله:

```bash
docker compose --profile storage up -d minio
```

لإيقاف المكدس أثناء التطوير استخدم `docker compose down` فقط. لا تستخدم `-v`
إلا إذا كان حذف بيانات التطوير المقصود صراحةً.

## أوامر الجودة وقاعدة البيانات

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build

pnpm test:smoke
```

أوامر `pnpm db:migrate` و`pnpm db:status` و`pnpm db:verify` موجودة أيضاً داخل
حزمة قاعدة البيانات؛ في الإعداد الافتراضي المعزول نفّذها عبر `docker compose run`
كما في قسم البدء المحلي أعلاه.

تستخدم الترحيلات SQL forward-only في [`migrations`](./migrations)، مع جدول
`schema_migrations` وSHA-256 وPostgreSQL advisory lock. راجع
[`docs/DATABASE_MIGRATIONS.md`](./docs/DATABASE_MIGRATIONS.md) قبل إضافة ترحيل.

## الإنتاج والأسرار

لا تشغّل `compose.production.yaml` قبل إنشاء ملفات أسرار محمية خارج المستودع
وتعيين متغيرات المسارات التالية في بيئة النشر:

```text
ITQANAK_DATABASE_URL_SECRET_FILE
ITQANAK_REDIS_URL_SECRET_FILE
ITQANAK_POSTGRES_PASSWORD_SECRET_FILE
ITQANAK_REDIS_PASSWORD_SECRET_FILE
ITQANAK_VERIFY_DATABASE_URL_SECRET_FILE
```

كل ملف يحتوي قيمة واحدة فقط ويُمرّر إلى الحاوية كـ Docker secret. الخدمات تقرأ
`*_FILE` أو `/run/secrets/<name>` ولا تسجّل القيم. Gateway فقط يستمع محلياً على
`127.0.0.1:8080`؛ اربط Cloudflare بعد نجاح اختبارات النشر.

```bash
docker compose -f compose.production.yaml config
docker compose -f compose.production.yaml up -d --build
```

## النسخ الاحتياطي والاستعادة

أوامر النسخ آمنة وتستخدم `pg_dump -Fc` وchecksum واختبار restore منفصل:

```bash
scripts/backup-postgres.sh
scripts/verify-backup.sh /path/to/backup.dump
```

تُحفظ النسخ خارج الخادم في object storage متوافق مع S3. خطوات الاستعادة الكاملة
والـsystemd timer موثقة في [`docs/BACKUP_RESTORE.md`](./docs/BACKUP_RESTORE.md).

## حدود المرحلة الأولى

توجد واجهات وحواجز معمارية للتخزين الخاص، فحص الملفات، الـOutbox، الصلاحيات،
وسير حالات الطلب. التسجيل الفعلي، حسابات الطلاب، الطلبات، المحادثة، الدفع،
والإشعارات الخارجية مؤجلة للمراحل التالية. انظر
[`docs/ROADMAP.md`](./docs/ROADMAP.md) و[`docs/RECOVERED_SCOPE.md`](./docs/RECOVERED_SCOPE.md).

## التوثيق

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)
- [`docs/SECURITY.md`](./docs/SECURITY.md)
- [`docs/OPERATIONS.md`](./docs/OPERATIONS.md)
- [`docs/INCIDENT_RECOVERY.md`](./docs/INCIDENT_RECOVERY.md)
