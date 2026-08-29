import { DeadlineDurationInput } from "./deadline-duration-input";

export interface RequestFieldDefaults {
  readonly title?: string;
  readonly description?: string;
  readonly deadlineIso?: string;
  readonly urgency?: string;
  readonly languageCode?: string;
  readonly academicLevel?: string;
  readonly institutionName?: string;
  readonly privacyRequested?: boolean;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

const languageOptions = {
  ar: [
    ["ar", "العربية"],
    ["en", "الإنجليزية"],
    ["fr", "الفرنسية"],
    ["de", "الألمانية"],
    ["es", "الإسبانية"],
    ["tr", "التركية"],
  ],
  en: [
    ["ar", "Arabic"],
    ["en", "English"],
    ["fr", "French"],
    ["de", "German"],
    ["es", "Spanish"],
    ["tr", "Turkish"],
  ],
} as const;

const academicOptions = {
  ar: [
    ["SECONDARY", "الثانوية"],
    ["DIPLOMA", "الدبلوم"],
    ["BACHELOR", "البكالوريوس"],
    ["MASTER", "الماجستير"],
    ["DOCTORATE", "الدكتوراه"],
    ["PROFESSIONAL", "مهني"],
    ["OTHER", "أخرى"],
  ],
  en: [
    ["SECONDARY", "Secondary school"],
    ["DIPLOMA", "Diploma"],
    ["BACHELOR", "Bachelor's"],
    ["MASTER", "Master's"],
    ["DOCTORATE", "Doctorate"],
    ["PROFESSIONAL", "Professional"],
    ["OTHER", "Other"],
  ],
} as const;

export function RequestFields({
  defaults = {},
  locale = "ar",
}: Readonly<{ defaults?: RequestFieldDefaults; locale?: "ar" | "en" }>) {
  const english = locale === "en";
  const detailsOpen =
    defaults.urgency === "URGENT" ||
    (defaults.languageCode !== undefined && defaults.languageCode !== "") ||
    (defaults.academicLevel !== undefined && defaults.academicLevel !== "") ||
    (defaults.institutionName !== undefined && defaults.institutionName !== "") ||
    defaults.privacyRequested === true;
  return (
    <div className="grid gap-5">
      <div>
        <label className="text-sm font-bold" htmlFor="title">
          {english ? "Request title" : "عنوان الطلب"}
        </label>
        <input
          className={inputClassName}
          defaultValue={defaults.title}
          id="title"
          maxLength={160}
          minLength={3}
          name="title"
          placeholder={
            english
              ? "Example: Review the formatting of my graduation project"
              : "مثال: مراجعة تنسيق مشروع التخرج"
          }
        />
      </div>
      <div>
        <label className="text-sm font-bold" htmlFor="description">
          {english ? "Request description" : "وصف الطلب"}
        </label>
        <textarea
          className={inputClassName}
          defaultValue={defaults.description}
          id="description"
          maxLength={10_000}
          minLength={10}
          name="description"
          placeholder={
            english
              ? "Describe what you need and the outcome you expect."
              : "اشرح المطلوب والنتيجة التي تتوقعها."
          }
          rows={7}
        />
      </div>
      <div>
        <span className="text-sm font-bold">
          {english ? "When do you need it? (optional)" : "متى تحتاجه؟ (اختياري)"}
        </span>
        <DeadlineDurationInput
          {...(defaults.deadlineIso === undefined ? {} : { initialIso: defaults.deadlineIso })}
          locale={locale}
        />
      </div>

      <details
        className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-4 py-3"
        open={detailsOpen}
      >
        <summary className="cursor-pointer text-sm font-bold text-[var(--itq-color-ink-soft)]">
          {english ? "More details (optional)" : "تفاصيل إضافية (اختيارية)"}
        </summary>
        <div className="mt-4 grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-sm font-bold" htmlFor="urgency">
                {english ? "Urgency" : "درجة الاستعجال"}
              </label>
              <select
                className={inputClassName}
                defaultValue={defaults.urgency ?? "NORMAL"}
                id="urgency"
                name="urgency"
              >
                <option value="NORMAL">{english ? "Normal" : "عادي"}</option>
                <option value="URGENT">{english ? "Urgent" : "عاجل"}</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-bold" htmlFor="languageCode">
                {english ? "Preferred language" : "اللغة الاختيارية"}
              </label>
              <select
                className={inputClassName}
                defaultValue={defaults.languageCode ?? ""}
                id="languageCode"
                name="languageCode"
              >
                <option value="">{english ? "Not specified" : "غير محددة"}</option>
                {languageOptions[locale].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="text-sm font-bold" htmlFor="academicLevel">
                {english ? "Academic level" : "المستوى الدراسي"}
              </label>
              <select
                className={inputClassName}
                defaultValue={defaults.academicLevel ?? ""}
                id="academicLevel"
                name="academicLevel"
              >
                <option value="">{english ? "Not specified" : "غير محدد"}</option>
                {academicOptions[locale].map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-bold" htmlFor="institutionName">
                {english ? "Institution or university" : "المؤسسة أو الجامعة"}
              </label>
              <input
                className={inputClassName}
                defaultValue={defaults.institutionName}
                id="institutionName"
                maxLength={200}
                minLength={2}
                name="institutionName"
              />
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-[var(--itq-color-border)] bg-white p-4 text-sm font-semibold">
            <input
              className="mt-1 size-4"
              defaultChecked={defaults.privacyRequested}
              name="privacyRequested"
              type="checkbox"
              value="true"
            />
            {english
              ? "Please handle the details of this request with additional privacy."
              : "أطلب التعامل مع تفاصيل هذا الطلب بخصوصية إضافية."}
          </label>
        </div>
      </details>
    </div>
  );
}
