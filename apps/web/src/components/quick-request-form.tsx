"use client";

import { useMemo, useRef, useState } from "react";

import { RequestsIcon } from "./icons";

export interface QuickRequestService {
  readonly id: string;
  readonly name: string;
  readonly categoryName: string;
}

interface QuickRequestFormProps {
  readonly services: readonly QuickRequestService[];
  readonly csrfToken: string | undefined;
  readonly locale: "ar" | "en";
  readonly integrityVersion: string;
  /** Service id to highlight and focus first, from a `?service=` deep link. */
  readonly preselectServiceId?: string;
}

/** A UUID-v4-shaped id, so the idempotency key passes server validation even
 *  where `crypto.randomUUID` is missing (older in-app webviews). */
function submissionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const hex = "0123456789abcdef";
  let out = "";
  for (let index = 0; index < 36; index += 1) {
    if (index === 8 || index === 13 || index === 18 || index === 23) out += "-";
    else if (index === 14) out += "4";
    else if (index === 19) out += hex[(Math.floor(Math.random() * 4) + 8) % 16];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

/**
 * One-tap request creation: type a word or two (optional), then tap a service.
 * That single tap creates the request and drops the student into the chat,
 * where the rest of the details are worked out.
 *
 * This form works with **no JavaScript**: the service id rides on the tapped
 * `<button name="serviceId">` and the phrase rides on `name="phrase"`; the
 * server fills in a title/description from those (or the service name). The
 * `onSubmit` handler is a thin guard against a double tap — it never disables
 * the submit button, because a disabled submitter is dropped from the POST and
 * that was the old "review the fields" error.
 */
export function QuickRequestForm({
  services,
  csrfToken,
  locale,
  integrityVersion,
  preselectServiceId,
}: QuickRequestFormProps) {
  const english = locale === "en";
  const orderedServices = useMemo(() => {
    if (preselectServiceId === undefined) return services;
    const lead = services.filter((service) => service.id === preselectServiceId);
    return lead.length === 0
      ? services
      : [...lead, ...services.filter((s) => s.id !== preselectServiceId)];
  }, [services, preselectServiceId]);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);
  const key = useMemo(submissionId, []);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    if (submittedRef.current) {
      event.preventDefault();
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
  }

  return (
    <form
      action="/api/student/requests"
      aria-busy={submitting}
      className="relative grid gap-5"
      method="post"
      onSubmit={handleSubmit}
    >
      <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />
      <input name="locale" type="hidden" value={locale} />
      <input name="submissionKey" type="hidden" value={key} />
      <input name="intent" type="hidden" value="submit" />
      <input name="acceptedAcademicIntegrity" type="hidden" value="true" />
      <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
      <input name="quick" type="hidden" value="true" />

      <label className="block">
        <span className="text-sm font-black">
          {english ? "What do you need? (optional)" : "ماذا تحتاج؟ (اختياري)"}
        </span>
        <input
          autoComplete="off"
          className="mt-2 h-12 w-full rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 text-base outline-none focus:border-[var(--itq-color-brand-500)]"
          dir="auto"
          maxLength={160}
          name="phrase"
          onChange={(event) => setText(event.currentTarget.value)}
          placeholder={english ? "e.g. graduation research" : "مثال: بحث تخرج"}
          value={text}
        />
      </label>

      <div>
        <p className="mb-2 text-sm font-black">
          {english ? "Pick a service to start" : "اختر الخدمة للبدء"}
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {orderedServices.map((service) => {
            const preselected = service.id === preselectServiceId;
            return (
              <button
                aria-current={preselected ? "true" : undefined}
                autoFocus={preselected}
                className={`flex items-center gap-3 rounded-[var(--itq-radius-control)] border p-4 text-start transition hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)] active:scale-[0.98] ${
                  preselected
                    ? "border-[var(--itq-color-brand-500)] bg-[var(--itq-color-brand-50)] ring-2 ring-[var(--itq-color-brand-200)]"
                    : "border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]"
                }`}
                key={service.id}
                name="serviceId"
                type="submit"
                value={service.id}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
                  <RequestsIcon className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black" dir="auto">
                    {service.name}
                  </span>
                  <span
                    className="mt-0.5 block truncate text-xs text-[var(--itq-color-muted)]"
                    dir="auto"
                  >
                    {service.categoryName}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs leading-6 text-[var(--itq-color-muted)]">
        {english
          ? `By continuing you confirm this request follows the academic-integrity policy (${integrityVersion}) — the service is for learning and review, not plagiarism or exams.`
          : `بالمتابعة تُقر بأن الطلب يلتزم بسياسة النزاهة الأكاديمية (${integrityVersion})، وأن الخدمة للتعلّم والمراجعة لا للانتحال أو أداء الاختبارات.`}
      </p>

      {submitting ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 z-10 grid place-items-center rounded-[var(--itq-radius-panel)] bg-[color-mix(in_srgb,var(--itq-color-surface)_60%,transparent)]"
        >
          <span className="inline-flex items-center gap-2 rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-4 py-2 text-sm font-black text-white shadow-[var(--itq-shadow-sm)]">
            {english ? "Creating…" : "جارٍ الإنشاء…"}
          </span>
        </span>
      ) : null}
    </form>
  );
}
