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
}

/**
 * One-tap request creation: type a word or two (optional), then tap a service.
 * That single tap creates the request, submits it, and drops the student into
 * the conversation — the rest of the details are gathered there, not in a form.
 *
 * The service id rides on the tapped button (`name="serviceId"`), so a plain
 * HTML submit works with no JavaScript at all; the `onSubmit` handler is pure
 * enhancement that carries the typed phrase into the title/description. If the
 * fields arrive blank the server derives them from the service name.
 */
export function QuickRequestForm({
  services,
  csrfToken,
  locale,
  integrityVersion,
}: QuickRequestFormProps) {
  const english = locale === "en";
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submissionKey = useMemo(
    () =>
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    [],
  );
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);

  function handleSubmit(): void {
    const phrase = text.trim();
    if (phrase.length >= 3) {
      if (titleRef.current) titleRef.current.value = phrase;
      if (descriptionRef.current) {
        descriptionRef.current.value = english
          ? `${phrase} — I will share the details in the chat.`
          : `${phrase} — سأوضح التفاصيل في المحادثة.`;
      }
    }
    // Never block the submit: the tapped button already carries the service id.
    setSubmitting(true);
  }

  return (
    <form
      action="/api/student/requests"
      className="grid gap-5"
      method="post"
      onSubmit={() => handleSubmit()}
    >
      <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />
      <input name="locale" type="hidden" value={locale} />
      <input name="submissionKey" type="hidden" value={submissionKey} />
      <input name="intent" type="hidden" value="submit" />
      <input name="acceptedAcademicIntegrity" type="hidden" value="true" />
      <input name="academicIntegrityVersion" type="hidden" value={integrityVersion} />
      <input name="quick" type="hidden" value="true" />
      <input defaultValue="" name="title" ref={titleRef} type="hidden" />
      <input defaultValue="" name="description" ref={descriptionRef} type="hidden" />

      <label className="block">
        <span className="text-sm font-black">
          {english ? "What do you need? (optional)" : "ماذا تحتاج؟ (اختياري)"}
        </span>
        <input
          autoComplete="off"
          className="mt-2 h-14 w-full rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 text-base shadow-sm outline-none focus:border-[var(--itq-color-brand-500)]"
          dir="auto"
          maxLength={160}
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
          {services.map((service) => (
            <button
              className="flex items-center gap-3 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-4 text-start shadow-sm transition active:scale-[0.98] hover:border-[var(--itq-color-brand-300)] hover:bg-[var(--itq-color-brand-50)] disabled:opacity-50"
              disabled={submitting}
              key={service.id}
              name="serviceId"
              type="submit"
              value={service.id}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
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
          ))}
        </div>
      </div>

      <p className="text-xs leading-6 text-[var(--itq-color-muted)]">
        {english
          ? `By continuing you confirm this request follows the academic-integrity policy (${integrityVersion}) — the service is for learning and review, not plagiarism or exams.`
          : `بالمتابعة تُقر بأن الطلب يلتزم بسياسة النزاهة الأكاديمية (${integrityVersion})، وأن الخدمة للتعلّم والمراجعة لا للانتحال أو أداء الاختبارات.`}
      </p>
    </form>
  );
}
