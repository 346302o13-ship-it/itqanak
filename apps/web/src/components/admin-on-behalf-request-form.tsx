"use client";

import { useState, type ReactNode } from "react";

import { FormErrorSummary } from "./form-error-summary";

/**
 * The "create a request on behalf of a student" form. Submitted with fetch
 * rather than a full navigation so a validation failure keeps every field the
 * admin filled in — the request description alone can be longer than a URL can
 * carry, so the query-string round-trip used by the smaller forms is not an
 * option here.
 */
export function AdminOnBehalfRequestForm({
  csrfToken,
  locale,
  children,
}: Readonly<{ csrfToken: string | undefined; locale: "ar" | "en"; children: ReactNode }>) {
  const english = locale === "en";
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    setSubmitting(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/requests", {
        method: "POST",
        body: new FormData(form),
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as {
        readonly requestNumber?: string;
        readonly notice?: string;
        readonly message?: string;
      };
      if (!response.ok || typeof payload.requestNumber !== "string") {
        setError(
          payload.message ??
            (english
              ? "The request could not be created. Review the fields and try again."
              : "تعذر إنشاء الطلب. راجع الحقول ثم أعد المحاولة."),
        );
        setSubmitting(false);
        return;
      }
      window.location.assign(
        `/${locale}/admin/requests/${encodeURIComponent(payload.requestNumber)}?notice=${encodeURIComponent(
          payload.notice ?? "draft_created",
        )}`,
      );
    } catch {
      setError(
        english ? "A network error occurred. Try again." : "حدث خطأ في الشبكة. حاول مجددًا.",
      );
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-6 grid gap-5" method="post" onSubmit={onSubmit}>
      <input name="csrfToken" type="hidden" value={csrfToken ?? ""} />
      <input name="locale" type="hidden" value={locale} />
      <input name="submissionKey" type="hidden" value={submissionKey} />
      {error ? <FormErrorSummary>{error}</FormErrorSummary> : null}
      {children}
      <button
        className="inline-flex min-h-11 w-fit items-center justify-center rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-2 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
        disabled={submitting}
        type="submit"
      >
        {submitting
          ? english
            ? "Saving…"
            : "جارٍ الحفظ…"
          : english
            ? "Create student request"
            : "إنشاء طلب للطالب"}
      </button>
    </form>
  );
}
