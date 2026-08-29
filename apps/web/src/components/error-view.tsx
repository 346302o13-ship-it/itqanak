"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface ErrorViewProps {
  readonly kind: "error" | "not-found";
  readonly reset?: () => void;
  readonly digest?: string;
}

const copy = {
  ar: {
    errorTitle: "تعذر إكمال الطلب",
    errorBody: "حدث خطأ غير متوقع. يمكنك المحاولة مرة أخرى.",
    retry: "إعادة المحاولة",
    notFoundTitle: "الصفحة غير موجودة",
    notFoundBody: "تحقق من الرابط أو عُد إلى الصفحة الرئيسية.",
    home: "العودة إلى إتقانك",
    ref: "الرقم المرجعي",
  },
  en: {
    errorTitle: "Something went wrong",
    errorBody: "An unexpected error occurred. You can try again.",
    retry: "Try again",
    notFoundTitle: "Page not found",
    notFoundBody: "Check the link or go back to the home page.",
    home: "Back to ITQANAK",
    ref: "Reference",
  },
} as const;

export function ErrorView({ kind, reset, digest }: ErrorViewProps) {
  // Default to Arabic (the primary locale); switch to English only for /en/*.
  const [locale, setLocale] = useState<"ar" | "en">("ar");
  useEffect(() => {
    if (window.location.pathname.startsWith("/en")) setLocale("en");
  }, []);
  const t = copy[locale];
  const english = locale === "en";
  const home = english ? "/en" : "/ar";

  useEffect(() => {
    if (kind !== "error") return;
    // Best-effort, redacted client-error signal; failures are ignored.
    void fetch("/api/client-error", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pathname: window.location.pathname,
        ...(digest === undefined ? {} : { digest }),
      }),
    }).catch(() => undefined);
  }, [kind, digest]);

  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-12 text-center"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      <section className="w-full rounded-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-8 shadow-[var(--itq-shadow-card)]">
        {kind === "not-found" ? (
          <p className="text-sm font-bold text-[var(--itq-color-brand-700)]">404</p>
        ) : null}
        <h1 className="mt-3 text-3xl font-black">
          {kind === "not-found" ? t.notFoundTitle : t.errorTitle}
        </h1>
        <p className="mt-4 text-[var(--itq-color-muted)]">
          {kind === "not-found" ? t.notFoundBody : t.errorBody}
        </p>
        {kind === "error" && reset !== undefined ? (
          <button
            className="mt-7 rounded-xl bg-[var(--itq-color-brand-700)] px-4 py-3 font-bold text-white"
            onClick={reset}
            type="button"
          >
            {t.retry}
          </button>
        ) : (
          <Link
            className="mt-7 inline-flex rounded-xl bg-[var(--itq-color-brand-700)] px-4 py-3 font-bold text-white"
            href={home}
          >
            {t.home}
          </Link>
        )}
        {digest === undefined ? null : (
          <p className="mt-4 text-[11px] font-semibold text-[var(--itq-color-muted)]">
            {t.ref}: <span dir="ltr">{digest}</span>
          </p>
        )}
      </section>
    </main>
  );
}
