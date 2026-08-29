import { generateSubmissionKey } from "@itqanak/core";
import type { AdminStudentSummary } from "@itqanak/auth";

import { CsrfInput, FormAlert } from "./auth-shell";
import { FormErrorSummary } from "./form-error-summary";
import { RequestFields } from "./request-fields";
import { SubmitButton } from "./submit-button";

interface ServiceOption {
  readonly id: string;
  readonly label: string;
}

export interface AdminStudentDraft {
  readonly displayName?: string;
  readonly phone?: string;
  readonly countryCode?: string;
  readonly whatsappReference?: string;
  readonly note?: string;
}

interface AdminStudentOperationsProps {
  readonly csrfToken: string | undefined;
  readonly locale?: "ar" | "en";
  readonly notice?: string;
  readonly services: readonly ServiceOption[];
  readonly students: readonly AdminStudentSummary[];
  readonly studentDraft?: AdminStudentDraft;
}

const errorNotices = new Set(["invalid", "failed", "csrf", "conflict", "forbidden", "unavailable"]);

type Query = Record<string, string | string[] | undefined>;
const q = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** Rebuild the create-student draft the POST handler echoed back on failure. */
export function readAdminStudentDraft(query: Query): AdminStudentDraft | undefined {
  const displayName = q(query.sn);
  const phone = q(query.sp);
  const countryCode = q(query.sc);
  const whatsappReference = q(query.sr);
  const note = q(query.snote);
  const draft: AdminStudentDraft = {
    ...(displayName === undefined ? {} : { displayName }),
    ...(phone === undefined ? {} : { phone }),
    ...(countryCode === undefined ? {} : { countryCode }),
    ...(whatsappReference === undefined ? {} : { whatsappReference }),
    ...(note === undefined ? {} : { note }),
  };
  return Object.keys(draft).length === 0 ? undefined : draft;
}

const inputClassName =
  "mt-2 w-full rounded-xl border border-[var(--itq-color-border)] bg-white px-3 py-3 text-base shadow-sm";

export function AdminStudentOperations({
  csrfToken,
  locale = "ar",
  notice,
  services,
  students,
  studentDraft,
}: AdminStudentOperationsProps) {
  const english = locale === "en";
  const isError = notice !== undefined && errorNotices.has(notice);
  const draftInvalid = isError && studentDraft !== undefined;
  const message =
    notice === "invalid"
      ? english
        ? "Review the submitted fields. The phone may already belong to an account."
        : "راجع البيانات. قد يكون رقم الجوال مرتبطًا بحساب موجود."
      : english
        ? "The operation could not be completed. Try again."
        : "تعذر إكمال العملية. حاول مجددًا.";
  return (
    <div>
      {notice === undefined ? null : isError ? (
        <FormErrorSummary>{message}</FormErrorSummary>
      ) : (
        <FormAlert>{message}</FormAlert>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-black text-[var(--itq-color-brand-700)]">
            {english ? "Verified account" : "حساب موثق"}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {english ? "Create a student account" : "إنشاء حساب طالب"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
            {english
              ? "Use only after the student contacts support from this number. A one-time password setup link will be shown next."
              : "استخدمه فقط بعد تواصل الطالب من الرقم نفسه. سيظهر بعد الإنشاء رابط أحادي لإعداد كلمة المرور."}
          </p>
          <form action="/api/admin/students" className="mt-6 grid gap-4" method="post">
            <CsrfInput token={csrfToken} />
            <input name="locale" type="hidden" value={locale} />
            <label className="text-sm font-bold">
              {english ? "Student name" : "اسم الطالب"}
              <input
                autoComplete="off"
                autoFocus={draftInvalid}
                className={inputClassName}
                defaultValue={studentDraft?.displayName}
                maxLength={120}
                minLength={2}
                name="displayName"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
              <label className="text-sm font-bold">
                {english ? "Country" : "الدولة"}
                <select
                  className={inputClassName}
                  defaultValue={studentDraft?.countryCode ?? "SA"}
                  name="countryCode"
                >
                  <option value="SA">{english ? "Saudi Arabia" : "السعودية"}</option>
                  <option value="AE">{english ? "UAE" : "الإمارات"}</option>
                  <option value="KW">{english ? "Kuwait" : "الكويت"}</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                {english ? "Mobile number" : "رقم الجوال"}
                <input
                  aria-invalid={draftInvalid || undefined}
                  autoComplete="off"
                  className={inputClassName}
                  defaultValue={studentDraft?.phone}
                  dir="ltr"
                  maxLength={20}
                  name="phone"
                  placeholder="+9665XXXXXXXX"
                  required
                  type="tel"
                />
              </label>
            </div>
            <label className="text-sm font-bold">
              {english ? "WhatsApp conversation reference" : "مرجع محادثة واتساب"}
              <input
                aria-invalid={draftInvalid || undefined}
                autoComplete="off"
                className={inputClassName}
                defaultValue={studentDraft?.whatsappReference}
                dir="ltr"
                maxLength={160}
                minLength={3}
                name="whatsappReference"
                required
              />
            </label>
            <label className="text-sm font-bold">
              {english
                ? "Internal verification note (optional)"
                : "ملاحظة التحقق الداخلية (اختيارية)"}
              <textarea
                className={inputClassName}
                defaultValue={studentDraft?.note}
                maxLength={1000}
                name="note"
                rows={3}
              />
            </label>
            <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-950">
              <input
                className="mt-1 size-4"
                name="confirmedSameNumber"
                required
                type="checkbox"
                value="true"
              />
              {english
                ? "I confirm the inbound WhatsApp message came from the number entered above."
                : "أؤكد أن رسالة واتساب الواردة جاءت من الرقم المدخل أعلاه."}
            </label>
            <SubmitButton pendingLabel={english ? "Creating…" : "جارٍ الإنشاء…"}>
              {english ? "Create and issue setup link" : "إنشاء وإصدار رابط الإعداد"}
            </SubmitButton>
          </form>
        </section>

        <section className="rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-sm sm:p-6">
          <p className="text-sm font-black text-[var(--itq-color-brand-700)]">
            {english ? "On behalf of a student" : "نيابةً عن الطالب"}
          </p>
          <h2 className="mt-1 text-2xl font-black">
            {english ? "Create a student request" : "إنشاء طلب للطالب"}
          </h2>
          <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
            {english
              ? "The student remains the owner. Submit it now after confirming the details with them, or leave it as a draft for their review."
              : "يبقى الطالب مالك الطلب. أرسله الآن بعد تأكيد التفاصيل معه، أو اتركه مسودة لمراجعته."}
          </p>
          {students.length === 0 || services.length === 0 ? (
            <FormAlert>
              {english
                ? "An active student and an active service are required."
                : "يلزم وجود طالب نشط وخدمة نشطة."}
            </FormAlert>
          ) : (
            <form action="/api/admin/requests" className="mt-6 grid gap-5" method="post">
              <CsrfInput token={csrfToken} />
              <input name="locale" type="hidden" value={locale} />
              <input name="submissionKey" type="hidden" value={generateSubmissionKey()} />
              <label className="text-sm font-bold">
                {english ? "Student" : "الطالب"}
                <select className={inputClassName} name="studentUserId" required>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.displayName} — {student.phoneE164}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-bold">
                {english ? "Service" : "الخدمة"}
                <select className={inputClassName} name="serviceId" required>
                  {services.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.label}
                    </option>
                  ))}
                </select>
              </label>
              <RequestFields locale={locale} />
              <label className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-950">
                <input
                  className="mt-1 size-4"
                  defaultChecked
                  name="submitImmediately"
                  type="checkbox"
                  value="true"
                />
                {english
                  ? "The student confirmed these details through WhatsApp. Submit this as an active request now."
                  : "أكد الطالب هذه التفاصيل عبر واتساب. أرسل الطلب الآن كطلب فعّال."}
              </label>
              <SubmitButton pendingLabel={english ? "Saving draft…" : "جارٍ حفظ المسودة…"}>
                {english ? "Create student request" : "إنشاء طلب للطالب"}
              </SubmitButton>
            </form>
          )}
        </section>
      </div>

      <section className="mt-7 rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-black text-[var(--itq-color-brand-700)]">
              {english ? "Student directory" : "دليل الطلاب"}
            </p>
            <h2 className="mt-1 text-2xl font-black">
              {english ? "Active verified accounts" : "الحسابات النشطة الموثقة"}
            </h2>
          </div>
          <span className="rounded-full bg-[var(--itq-color-brand-50)] px-3 py-1 text-xs font-black text-[var(--itq-color-brand-800)]">
            {students.length}
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {students.map((student) => (
            <article
              className="rounded-2xl border border-[var(--itq-color-border)] p-4"
              key={student.id}
            >
              <p className="font-black">{student.displayName}</p>
              <p className="mt-1 text-sm font-bold text-[var(--itq-color-muted)]" dir="ltr">
                {student.phoneE164}
              </p>
              <form action="/api/admin/support" className="mt-4" method="post">
                <CsrfInput token={csrfToken} />
                <input name="locale" type="hidden" value={locale} />
                <input name="studentUserId" type="hidden" value={student.id} />
                <SubmitButton
                  className="min-h-10 w-full rounded-xl bg-[var(--itq-color-brand-50)] px-3 py-2 text-xs text-[var(--itq-color-brand-800)] shadow-none"
                  pendingLabel="…"
                >
                  {english ? "Open general support chat" : "فتح محادثة الدعم العام"}
                </SubmitButton>
              </form>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
