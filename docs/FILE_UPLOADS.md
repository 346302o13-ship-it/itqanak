# رفع ملفات الطلبات

ملفات المرحلة الثالثة مرفقات خاصة بطلب خدمة، وليست محتوى عامًا ولا رسائل محادثة. يفرض
المسار الامتداد، و`Content-Type` المعلن، وبصمة المحتوى المكتشفة معًا قبل تخزين الجسم، ثم
يفرض فحص البرمجيات الضارة وسياسة الملكية قبل التنزيل.

## الأنواع المسموحة

| الامتداد        | MIME المطلوب                                                                |
| --------------- | --------------------------------------------------------------------------- |
| `.pdf`          | `application/pdf`                                                           |
| `.docx`         | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`   |
| `.pptx`         | `application/vnd.openxmlformats-officedocument.presentationml.presentation` |
| `.xlsx`         | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`         |
| `.txt`          | `text/plain` بترميز UTF-8 صالح ودون NUL في العينة                           |
| `.png`          | `image/png`                                                                 |
| `.jpg`, `.jpeg` | `image/jpeg`                                                                |

PDF وPNG وJPEG تتحقق من magic bytes. لا يكفي تغيير الامتداد أو ترويسة المتصفح. لا يسمح
بملفات تنفيذية أو SVG أو HTML أو ZIP عام أو تنسيقات Office القديمة.

## فحص OOXML المقيد

DOCX وPPTX وXLSX حاويات ZIP، لكنها لا تقبل لمجرد بدء الملف بـ`PK`. يقرأ المحلل رأسًا
مقيدًا بـ64 KiB وذيلًا مقيدًا بنحو 1.1 MiB، ثم يتحقق من EOCD والـcentral directory:

- ملف أحادي القرص، حتى 512 entry، وcentral directory حتى 1 MiB، ودون ZIP64 أو تشفير.
- أساليب الضغط `store` و`deflate` فقط، وإجمالي معلن غير مضغوط حتى 100 MiB ونسبة توسع
  قصوى 200 مع سماح أولي قدره 1 MiB.
- لا مسارات مطلقة أو `..` أو backslash أو أسماء مكررة دون حساسية الحالة أو symlink.
- وجود `[Content_Types].xml` و`_rels/.rels`، وعائلة واحدة مطابقة فقط من
  `word/document.xml` أو `ppt/presentation.xml` أو `xl/workbook.xml`.
- تصريح Content Type المطابق داخل XML، مع فك bounded وCRC32، ورفض `vbaProject.bin`.

هذا تحقق بنيوي محدود وليس Content Disarm and Reconstruction ولا بديلًا عن ClamAV. قد
يرفض عمدًا أرشيفًا صالحًا لا يلائم الحدود المحافظة.

## الأسماء والأحجام

يطبع اسم الملف إلى NFKC ثم يرفض الاسم الفارغ، أو الأطول من 255 حرفًا، أو الذي يحتوي
separator أو control character. يبقى الاسم الأصلي metadata فقط ولا يدخل مفتاح التخزين
أو path محليًا.

القيم الافتراضية المركزية:

```text
UPLOAD_MAX_FILE_BYTES=20971520
UPLOAD_MAX_FILES_PER_REQUEST=10
UPLOAD_MAX_TOTAL_BYTES_PER_REQUEST=104857600
```

أي 20 MiB للملف، و10 ملفات، و100 MiB للطلب. الحد الفعلي للملف وعدد الملفات هو الأصغر
بين إعداد المنصة وسياسة الخدمة في الكتالوج. يجب أن يكون `Content-Length` عددًا صحيحًا
موجبًا ضمن الحد، ويتحقق مسار التخزين مرة أخرى من أن عدد البايتات الفعلي يطابقه تمامًا.

## مسار الرفع

1. يتحقق route من الجلسة وHost/Origin وCSRF ونوع المحتوى و`Content-Length`، ثم ينفذ
   admission قبل أول بايت: الملكية والنسخة والحالة وسياسة الخدمة وعدد الملفات والحجم
   التجميعي. تعيد الخدمة الفحص نفسه تحت lock عند الحجز لمنع TOCTOU.
2. للأنواع غير OOXML يجمع رأسًا حتى 64 KiB ثم يمرر بقية الجسم مباشرة ببث محدود الذاكرة؛
   لا ينشئ نسخة كاملة. يحتاج OOXML إلى نهاية ZIP قبل التخزين، لذلك وحده يُنسخ إلى ملف
   مؤقت عشوائي `0600` ويحذف في `finally`. يحجز Web بحد أقصى 40 MiB وثمانية spools
   متزامنة داخل tmpfs ذي 64 MiB.
3. يفرض Web مهلة جدارية مطلقة قدرها خمس دقائق منذ بدء قراءة الجسم، وليس مهلة خمول فقط،
   ويلغي القارئ/الـpipeline عند انتهائها. كما يقبل حتى 32 stream رفع نشطة في العملية؛
   الزيادة تفشل مؤقتًا دون استهلاك body.
4. تتحقق الخدمة من الاسم والامتداد وMIME والمحتوى، وحالة الطلب وملكيته ونسخته وسياسة
   الخدمة والحدود التجميعية مرة أخرى.
5. تحجز صف attachment بحالة `PENDING_UPLOAD` ومفتاح opaque.
6. تخزن البايتات streaming وتحسب SHA-256 أثناء المرور.
7. تنهي الصف إلى `STORED` ثم `PENDING_SCAN` عندما يكون الفحص مفعّلًا. في الإنتاج
   الافتراضي المعطّل تنهيه إلى `SCAN_SKIPPED_BY_ADMIN`، وفي التطوير المعطّل إلى
   `SCAN_SKIPPED_DEVELOPMENT`. لا تعني أي حالة skipped أن الملف `CLEAN`.
8. تسجل حدث الطلب وoutbox والتدقيق. يرفع نجاح العملية `version` الطلب.

لا يحمل Web أو adapter الملف كاملًا في الذاكرة. يتحقق البث المباشر من framing أثناء
`put`، بينما يثبت spool المحدود framing قبل `put` لـOOXML فقط.

## حالات التخزين والفحص

حالة التخزين مستقلة عن نتيجة الفحص:

- `PENDING_UPLOAD`, `STORED`, `UPLOAD_FAILED`, `DELETE_PENDING`, `DELETED`.
- `NOT_REQUIRED`, `PENDING_SCAN`, `CLEAN`, `INFECTED`, `SCAN_ERROR`,
  `SCAN_SKIPPED_DEVELOPMENT`, `SCAN_SKIPPED_BY_ADMIN`, `REJECTED`.

لا تدعي المنصة ACID بين PostgreSQL والتخزين الخارجي. التعويض والمصالحة موثقان في
[`STORAGE.md`](./STORAGE.md)، ومسار الفحص في [`FILE_SCANNING.md`](./FILE_SCANNING.md).

## الإرسال والتنزيل والحذف

عند تفعيل الفحص لا يمكن إرسال الملف في المحادثة أو تنزيله حتى يصبح `CLEAN`. أما الملف
المرفوع أثناء الإيقاف فيبقى `SCAN_SKIPPED_BY_ADMIN` ويمكن إرساله وتنزيله مع تحذير صريح
دائم؛ لا يتحول إلى `CLEAN` ولا يدخل طابورًا عند تشغيل ClamAV لاحقًا. يمر التنزيل دائمًا
عبر تفويض التطبيق، ويستخدم `Content-Disposition: attachment` و
`application/octet-stream` و`nosniff` وCSP sandbox و`no-store` ولا يكشف storage key.
لا توجد معاينة inline لصورة أو مستند غير مفحوص. الاستثناء الوحيد تشغيل تسجيل صوتي
ذي MIME وبصمة مطابقين للقائمة الصوتية الضيقة، عبر endpoint مصادق و`nosniff` وCSP
sandbox مع شارة «غير مفحوص» في المحادثة.

الحذف المتاح في `DRAFT` و`SUBMITTED` soft-delete أولًا إلى `DELETE_PENDING`، ثم يحذف
الجسم ويثبت `DELETED`. إذا فشل الحذف يبقى الصف للمصالحة ولا يتظاهر التطبيق بالنجاح
المادي.

## أخطاء آمنة

تصنف طبقة التخزين أخطاء التحقق بكود قيمة فقط، وتترجمها طبقة الطلب إلى
`FILE_TOO_LARGE` أو `FILE_TYPE_NOT_ALLOWED` أو `FILE_MIME_MISMATCH` بدل الاعتماد على نص
رسالة داخلية. تعرض الحدود التجميعية `MAX_FILES_EXCEEDED` أو
`TOTAL_FILE_SIZE_EXCEEDED`، وتعاد مشكلة adapter كـ`STORAGE_UNAVAILABLE` دون endpoint أو
bucket أو path. انتهاء المهلة الجدارية للجسم يعاد كـ`UPLOAD_TIMEOUT` وHTTP 408 دون كشف
تفاصيل الشبكة.
