import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark, Surface } from "@itqanak/ui";

interface AuthShellProps {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly locale?: "ar" | "en";
}

export function AuthShell({ title, description, children, locale = "ar" }: AuthShellProps) {
  const english = locale === "en";
  return (
    <main
      className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-10 sm:px-8"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      <Surface className="w-full">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link
            aria-label={english ? "Back to home" : "العودة إلى الصفحة الرئيسية"}
            className="inline-flex items-center gap-3 rounded-xl text-lg font-black text-[var(--itq-color-ink)]"
            href={english ? "/en" : "/ar"}
          >
            <BrandMark />
            {english ? "ITQANAK" : "إتقانك"}
          </Link>
          <Link
            className="text-sm font-bold text-[var(--itq-color-brand-700)] underline"
            href={`/${locale}/auth/login`}
          >
            {english ? "Sign in" : "تسجيل الدخول"}
          </Link>
        </div>
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-3 leading-7 text-[var(--itq-color-muted)]">{description}</p>
        <div className="mt-8">{children}</div>
      </Surface>
    </main>
  );
}

export function FormAlert({
  children,
  tone = "error",
}: {
  readonly children: ReactNode;
  readonly tone?: "error" | "success";
}) {
  const colors =
    tone === "success"
      ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
      : "border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-950)]";
  return (
    <p
      aria-live="polite"
      className={`mb-5 rounded-xl border px-4 py-3 text-sm font-semibold ${colors}`}
      role="status"
    >
      {children}
    </p>
  );
}

export function CsrfInput({ token }: { readonly token: string | undefined }) {
  return <input name="csrfToken" type="hidden" value={token ?? ""} />;
}
