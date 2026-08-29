import type { ContentBlock, ContentTarget, ContentVariant } from "@itqanak/content";

import { CsrfInput } from "./auth-shell";
import { AdminShell } from "./admin-shell";
import { SubmitButton } from "./submit-button";

interface ContentAdminProps {
  readonly blocks: readonly ContentBlock[];
  readonly csrfToken: string | undefined;
  readonly displayName: string;
  readonly locale: "ar" | "en";
  readonly notice?: string;
}

const copyByLocale = {
  ar: {
    eyebrow: "إدارة التجربة",
    title: "محتوى الصفحات",
    description:
      "أضف كتل نصية آمنة بالعربية والإنجليزية للرئيسية أو لوحة الطالب، ثم انشرها أو أخفها فوراً دون تغيير المحتوى الأساسي.",
    addTitle: "إضافة كتلة محتوى",
    existingTitle: "الكتل الحالية",
    empty: "لا توجد كتل مخصصة بعد.",
    create: "إضافة الكتلة",
    creating: "جارٍ الإضافة…",
    save: "حفظ التعديلات",
    saving: "جارٍ الحفظ…",
    show: "نشر",
    hide: "إخفاء",
    delete: "حذف",
    confirmDelete: "أفهم أن الحذف يزيل الكتلة من لوحة الإدارة والعرض.",
    optionalAction: "زر اختياري",
    actionHint:
      "اترك الحقول الثلاثة فارغة، أو املأ التسميتين والرابط معاً. يقبل رابطاً داخلياً أو HTTPS فقط.",
    slug: "المعرّف",
    target: "موضع العرض",
    variant: "النمط",
    titleAr: "العنوان العربي",
    titleEn: "العنوان الإنجليزي",
    bodyAr: "النص العربي",
    bodyEn: "النص الإنجليزي",
    actionLabelAr: "تسمية الزر بالعربية",
    actionLabelEn: "تسمية الزر بالإنجليزية",
    actionHref: "رابط الزر",
    active: "الحالة عند الحفظ",
    sortOrder: "ترتيب العرض",
    visible: "منشورة",
    hidden: "مخفية",
    landing: "الصفحة الرئيسية",
    student: "لوحة الطالب",
    variants: {
      INFO: "معلومة",
      HIGHLIGHT: "إبراز",
      ANNOUNCEMENT: "إعلان",
      ACTION: "دعوة لاتخاذ إجراء",
    },
    notices: {
      created: "تمت إضافة كتلة المحتوى.",
      updated: "تم حفظ التغيير.",
      deleted: "تم حذف الكتلة من العرض والإدارة.",
      invalid: "راجع الحقول؛ العربية والإنجليزية مطلوبة والرابط يجب أن يكون آمناً.",
      conflict: "عدّل مدير آخر هذه الكتلة أو استخدم المعرّف نفسه. حدّث الصفحة ثم أعد المحاولة.",
      csrf: "انتهت صلاحية نموذج الأمان. حدّث الصفحة ثم أعد المحاولة.",
      forbidden: "لا تملك صلاحية تعديل المحتوى.",
      failed: "تعذر تنفيذ العملية.",
      not_found: "كتلة المحتوى غير موجودة.",
    },
  },
  en: {
    eyebrow: "Experience management",
    title: "Page content",
    description:
      "Add safe bilingual text blocks to the landing page or student dashboard, then publish or hide them without replacing the core experience.",
    addTitle: "Add a content block",
    existingTitle: "Current blocks",
    empty: "No custom content blocks yet.",
    create: "Add block",
    creating: "Adding…",
    save: "Save changes",
    saving: "Saving…",
    show: "Publish",
    hide: "Hide",
    delete: "Delete",
    confirmDelete: "I understand this removes the block from display and administration.",
    optionalAction: "Optional action button",
    actionHint:
      "Leave all three fields empty, or provide both labels and the URL. Only internal or HTTPS links are accepted.",
    slug: "Slug",
    target: "Display location",
    variant: "Style",
    titleAr: "Arabic title",
    titleEn: "English title",
    bodyAr: "Arabic body",
    bodyEn: "English body",
    actionLabelAr: "Arabic button label",
    actionLabelEn: "English button label",
    actionHref: "Button URL",
    active: "Status after saving",
    sortOrder: "Display order",
    visible: "Published",
    hidden: "Hidden",
    landing: "Landing page",
    student: "Student dashboard",
    variants: {
      INFO: "Information",
      HIGHLIGHT: "Highlight",
      ANNOUNCEMENT: "Announcement",
      ACTION: "Call to action",
    },
    notices: {
      created: "The content block was added.",
      updated: "The change was saved.",
      deleted: "The block was removed from display and administration.",
      invalid: "Review the fields; both languages are required and the link must be safe.",
      conflict:
        "Another administrator changed this block or used the same slug. Refresh and try again.",
      csrf: "The security form expired. Refresh and try again.",
      forbidden: "You do not have permission to edit content.",
      failed: "The operation could not be completed.",
      not_found: "The content block was not found.",
    },
  },
} as const;

const inputClass =
  "mt-2 min-h-12 w-full rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-3.5 py-2 text-sm outline-none transition focus:border-[var(--itq-color-brand-500)] focus:ring-4 focus:ring-[var(--itq-color-brand-100)]";

function ContentFields({
  block,
  idPrefix,
  locale,
}: Readonly<{ block?: ContentBlock; idPrefix: string; locale: "ar" | "en" }>) {
  const copy = copyByLocale[locale];
  const targets: readonly [ContentTarget, string][] = [
    ["LANDING", copy.landing],
    ["STUDENT_DASHBOARD", copy.student],
  ];
  const variants = Object.entries(copy.variants) as readonly [ContentVariant, string][];
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-black" htmlFor={`${idPrefix}-slug`}>
          {copy.slug}
          <input
            className={inputClass}
            defaultValue={block?.slug}
            id={`${idPrefix}-slug`}
            maxLength={80}
            minLength={2}
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
        </label>
        <label className="text-sm font-black" htmlFor={`${idPrefix}-target`}>
          {copy.target}
          <select
            className={inputClass}
            defaultValue={block?.target ?? "LANDING"}
            id={`${idPrefix}-target`}
            name="target"
          >
            {targets.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-black" htmlFor={`${idPrefix}-variant`}>
          {copy.variant}
          <select
            className={inputClass}
            defaultValue={block?.variant ?? "INFO"}
            id={`${idPrefix}-variant`}
            name="variant"
          >
            {variants.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-black" htmlFor={`${idPrefix}-sort`}>
          {copy.sortOrder}
          <input
            className={inputClass}
            defaultValue={block?.sortOrder ?? 100}
            id={`${idPrefix}-sort`}
            max={100000}
            min={0}
            name="sortOrder"
            required
            type="number"
          />
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-sm font-black" dir="rtl" htmlFor={`${idPrefix}-title-ar`}>
          {copy.titleAr}
          <input
            className={inputClass}
            defaultValue={block?.titleAr}
            id={`${idPrefix}-title-ar`}
            maxLength={160}
            minLength={2}
            name="titleAr"
            required
          />
        </label>
        <label className="text-sm font-black" dir="ltr" htmlFor={`${idPrefix}-title-en`}>
          {copy.titleEn}
          <input
            className={inputClass}
            defaultValue={block?.titleEn}
            id={`${idPrefix}-title-en`}
            maxLength={160}
            minLength={2}
            name="titleEn"
            required
          />
        </label>
        <label className="text-sm font-black" dir="rtl" htmlFor={`${idPrefix}-body-ar`}>
          {copy.bodyAr}
          <textarea
            className={`${inputClass} min-h-32 resize-y`}
            defaultValue={block?.bodyAr}
            id={`${idPrefix}-body-ar`}
            maxLength={4000}
            minLength={2}
            name="bodyAr"
            required
          />
        </label>
        <label className="text-sm font-black" dir="ltr" htmlFor={`${idPrefix}-body-en`}>
          {copy.bodyEn}
          <textarea
            className={`${inputClass} min-h-32 resize-y`}
            defaultValue={block?.bodyEn}
            id={`${idPrefix}-body-en`}
            maxLength={4000}
            minLength={2}
            name="bodyEn"
            required
          />
        </label>
      </div>

      <fieldset className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-4">
        <legend className="px-2 text-sm font-black">{copy.optionalAction}</legend>
        <p className="mb-3 text-xs leading-6 text-[var(--itq-color-muted)]">{copy.actionHint}</p>
        <div className="grid gap-4 lg:grid-cols-3">
          <label className="text-sm font-black" dir="rtl" htmlFor={`${idPrefix}-action-ar`}>
            {copy.actionLabelAr}
            <input
              className={inputClass}
              defaultValue={block?.actionLabelAr ?? ""}
              id={`${idPrefix}-action-ar`}
              maxLength={80}
              name="actionLabelAr"
            />
          </label>
          <label className="text-sm font-black" dir="ltr" htmlFor={`${idPrefix}-action-en`}>
            {copy.actionLabelEn}
            <input
              className={inputClass}
              defaultValue={block?.actionLabelEn ?? ""}
              id={`${idPrefix}-action-en`}
              maxLength={80}
              name="actionLabelEn"
            />
          </label>
          <label className="text-sm font-black" dir="ltr" htmlFor={`${idPrefix}-action-href`}>
            {copy.actionHref}
            <input
              className={inputClass}
              defaultValue={block?.actionHref ?? ""}
              id={`${idPrefix}-action-href`}
              maxLength={1000}
              name="actionHref"
              placeholder="/ar/services or https://…"
            />
          </label>
        </div>
      </fieldset>

      <label className="max-w-xs text-sm font-black" htmlFor={`${idPrefix}-active`}>
        {copy.active}
        <select
          className={inputClass}
          defaultValue={block?.active === true ? "true" : "false"}
          id={`${idPrefix}-active`}
          name="active"
        >
          <option value="false">{copy.hidden}</option>
          <option value="true">{copy.visible}</option>
        </select>
      </label>
    </div>
  );
}

export function ContentAdmin({
  blocks,
  csrfToken,
  displayName,
  locale,
  notice,
}: ContentAdminProps) {
  const copy = copyByLocale[locale];
  const noticeText =
    notice === undefined ? undefined : copy.notices[notice as keyof typeof copy.notices];
  return (
    <AdminShell csrfToken={csrfToken} displayName={displayName} locale={locale}>
      <div>
        <p className="text-sm font-black text-[var(--itq-color-brand-strong)]">{copy.eyebrow}</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">{copy.title}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-[var(--itq-color-muted)]">{copy.description}</p>
      </div>

      {noticeText === undefined ? null : (
        <p
          className="mt-6 rounded-2xl border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-4 text-sm font-black text-[var(--itq-color-brand-strong)]"
          role="status"
        >
          {noticeText}
        </p>
      )}

      <details
        className="mt-8 rounded-[1.5rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-sm)]"
        open
      >
        <summary className="cursor-pointer list-none p-5 text-xl font-black sm:p-6">
          {copy.addTitle}
        </summary>
        <form
          action="/api/admin/content"
          className="border-t border-[var(--itq-color-border)] p-5 sm:p-6"
          method="post"
        >
          <CsrfInput token={csrfToken} />
          <input name="locale" type="hidden" value={locale} />
          <ContentFields idPrefix="content-create" locale={locale} />
          <SubmitButton className="mt-6" pendingLabel={copy.creating}>
            {copy.create}
          </SubmitButton>
        </form>
      </details>

      <section className="mt-8" aria-labelledby="existing-content-title">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-black" id="existing-content-title">
            {copy.existingTitle}
          </h2>
          <span className="rounded-full bg-[var(--itq-color-surface-soft)] px-3 py-1 text-xs font-black">
            {new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US").format(blocks.length)}
          </span>
        </div>
        {blocks.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-[var(--itq-color-border-strong)] p-8 text-center text-sm text-[var(--itq-color-muted)]">
            {copy.empty}
          </p>
        ) : (
          <div className="mt-4 grid gap-4">
            {blocks.map((block) => {
              const action = `/api/admin/content/${encodeURIComponent(block.id)}`;
              return (
                <details
                  className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-[var(--itq-shadow-sm)]"
                  key={block.id}
                >
                  <summary className="cursor-pointer list-none p-5 sm:p-6">
                    <span className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="block font-black" dir="auto">
                          {locale === "ar" ? block.titleAr : block.titleEn}
                        </span>
                        <bdi className="mt-1 block text-xs text-[var(--itq-color-muted)]" dir="ltr">
                          {block.slug} · v{block.version}
                        </bdi>
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-black ${block.active ? "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-800)]" : "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-muted)]"}`}
                      >
                        {block.active ? copy.visible : copy.hidden}
                      </span>
                    </span>
                  </summary>
                  <div className="border-t border-[var(--itq-color-border)] p-5 sm:p-6">
                    <form action={action} method="post">
                      <CsrfInput token={csrfToken} />
                      <input name="locale" type="hidden" value={locale} />
                      <input name="version" type="hidden" value={block.version} />
                      <input name="action" type="hidden" value="update" />
                      <ContentFields
                        block={block}
                        idPrefix={`content-${block.id}`}
                        locale={locale}
                      />
                      <SubmitButton className="mt-6" pendingLabel={copy.saving}>
                        {copy.save}
                      </SubmitButton>
                    </form>
                    <div className="mt-6 flex flex-wrap items-start justify-between gap-4 border-t border-[var(--itq-color-border)] pt-5">
                      <form action={action} method="post">
                        <CsrfInput token={csrfToken} />
                        <input name="locale" type="hidden" value={locale} />
                        <input name="version" type="hidden" value={block.version} />
                        <input name="action" type="hidden" value={block.active ? "hide" : "show"} />
                        <SubmitButton
                          className="!bg-[var(--itq-color-ink-soft)] !text-white"
                          pendingLabel="…"
                        >
                          {block.active ? copy.hide : copy.show}
                        </SubmitButton>
                      </form>
                      <details className="max-w-md rounded-xl border border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] p-3 text-[var(--itq-color-danger-900)]">
                        <summary className="cursor-pointer text-sm font-black">
                          {copy.delete}
                        </summary>
                        <form action={action} className="mt-3" method="post">
                          <CsrfInput token={csrfToken} />
                          <input name="locale" type="hidden" value={locale} />
                          <input name="version" type="hidden" value={block.version} />
                          <input name="action" type="hidden" value="delete" />
                          <label className="flex items-start gap-2 text-xs font-bold leading-5">
                            <input
                              className="mt-1"
                              name="confirmDelete"
                              required
                              type="checkbox"
                              value="true"
                            />
                            {copy.confirmDelete}
                          </label>
                          <SubmitButton
                            className="mt-3 !bg-[var(--itq-color-danger-700)] !text-white"
                            pendingLabel="…"
                          >
                            {copy.delete}
                          </SubmitButton>
                        </form>
                      </details>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </AdminShell>
  );
}
