# آلة حالات الطلب

المصدر الوحيد لسياسة الانتقال هو `packages/core/src/request-state.ts`. المصفوفة لا تمنح
صلاحية ولا ملكية بذاتها؛ يجب قبل استخدامها التحقق من الجلسة وRBAC وملكية الطلب. تقيد
PostgreSQL مجموعة القيم الممكنة، بينما تمنع طبقة المجال الانتقالات غير القانونية.

## الحالات

| الحالة                | المعنى                             |
| --------------------- | ---------------------------------- |
| `DRAFT`               | مسودة الطالب القابلة للتعديل.      |
| `SUBMITTED`           | أرسلها الطالب وتنتظر بدء المراجعة. |
| `UNDER_REVIEW`        | تراجعها الإدارة.                   |
| `WAITING_FOR_STUDENT` | تحتاج معلومات أو ردًا من الطالب.   |
| `QUOTED`              | صدر عرض سعر.                       |
| `ACCEPTED`            | قبل الطالب العرض.                  |
| `IN_PROGRESS`         | بدأ تنفيذ الخدمة.                  |
| `DELIVERED`           | سلمت النتيجة للطالب.               |
| `REVISION_REQUESTED`  | طلب الطالب مراجعة أو تعديلًا.      |
| `COMPLETED`           | اكتمل الطلب نهائيًا.               |
| `CANCELLED`           | ألغي الطلب.                        |
| `REJECTED`            | رفض الطلب.                         |

`COMPLETED` و`CANCELLED` و`REJECTED` نهائية في المصفوفة الحالية.

## الانتقالات القانونية

`STUDENT` يعني الطالب بعد تحقق الملكية. `ADMIN/SYSTEM` يعني جهة إدارية أو عاملًا بعد
تحقق الصلاحية المناسبة.

| من                    | إلى                   | الفاعل المسموح               |
| --------------------- | --------------------- | ---------------------------- |
| `DRAFT`               | `SUBMITTED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `DRAFT`               | `CANCELLED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `SUBMITTED`           | `UNDER_REVIEW`        | `ADMIN`, `SYSTEM`            |
| `SUBMITTED`           | `CANCELLED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `SUBMITTED`           | `REJECTED`            | `ADMIN`, `SYSTEM`            |
| `UNDER_REVIEW`        | `WAITING_FOR_STUDENT` | `ADMIN`, `SYSTEM`            |
| `UNDER_REVIEW`        | `QUOTED`              | `ADMIN`, `SYSTEM`            |
| `UNDER_REVIEW`        | `IN_PROGRESS`         | `ADMIN`, `SYSTEM`            |
| `UNDER_REVIEW`        | `REJECTED`            | `ADMIN`, `SYSTEM`            |
| `UNDER_REVIEW`        | `CANCELLED`           | `ADMIN`, `SYSTEM`            |
| `WAITING_FOR_STUDENT` | `SUBMITTED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `WAITING_FOR_STUDENT` | `UNDER_REVIEW`        | `ADMIN`, `SYSTEM`            |
| `WAITING_FOR_STUDENT` | `CANCELLED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `WAITING_FOR_STUDENT` | `REJECTED`            | `ADMIN`, `SYSTEM`            |
| `QUOTED`              | `ACCEPTED`            | `STUDENT`, `ADMIN`, `SYSTEM` |
| `QUOTED`              | `CANCELLED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `QUOTED`              | `REJECTED`            | `ADMIN`, `SYSTEM`            |
| `ACCEPTED`            | `IN_PROGRESS`         | `ADMIN`, `SYSTEM`            |
| `ACCEPTED`            | `CANCELLED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `IN_PROGRESS`         | `WAITING_FOR_STUDENT` | `ADMIN`, `SYSTEM`            |
| `IN_PROGRESS`         | `DELIVERED`           | `ADMIN`, `SYSTEM`            |
| `IN_PROGRESS`         | `CANCELLED`           | `ADMIN`, `SYSTEM`            |
| `DELIVERED`           | `REVISION_REQUESTED`  | `STUDENT`, `ADMIN`, `SYSTEM` |
| `DELIVERED`           | `COMPLETED`           | `STUDENT`, `ADMIN`, `SYSTEM` |
| `REVISION_REQUESTED`  | `IN_PROGRESS`         | `ADMIN`, `SYSTEM`            |
| `REVISION_REQUESTED`  | `DELIVERED`           | `ADMIN`, `SYSTEM`            |

## ما هو متاح الآن

واجهة الطالب في المرحلة الثالثة تستدعي فقط:

- `DRAFT -> SUBMITTED` بعد تحقق البيانات والموافقة على النزاهة الأكاديمية.
- `DRAFT -> CANCELLED` و`SUBMITTED -> CANCELLED` بطلب الطالب.

بقية الحالات والانتقالات معرفة لتثبيت عقد المجال، لكنها لا تعني وجود شاشة أو API إدارة.
المرحلة الرابعة ستضيف إدارة الطلب والتعيين وأفعال الموظفين، والمراحل التالية ستضيف العرض
والتسليم والمراجعات ضمن صلاحيات مستقلة.

## قواعد التطبيق

1. لا يكتب route أو component قيمة `status` مباشرة.
2. يمر كل انتقال عبر دوال Core ثم تحديث PostgreSQL مشروط بالحالة والـ`version` الحالية.
3. الفشل في الملكية يظهر كـ404، والفشل في الانتقال كخطأ مجال آمن، والتعارض المتزامن كـ409.
4. يسجل الانتقال في `service_request_events` في معاملة تغيير الطلب نفسها، مع
   `from_status` و`to_status` والنسخة الناتجة.
5. الأحداث التي تحتاج عملًا غير متزامن تدخل `outbox_events` بمفتاح idempotency ثابت في
   المعاملة نفسها.

هذه الآلة ليست بديلًا عن شروط العمل الإضافية. مثلًا، الإرسال يتحقق أيضًا من الخدمة،
والحقول، ونسخة سياسة النزاهة، وحالات المرفقات قبل تنفيذ الانتقال.
