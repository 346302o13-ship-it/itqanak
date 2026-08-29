import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@itqanak/ui";

import { AccountNavigation } from "./account-navigation";
import { CsrfInput } from "./auth-shell";
import { LogOutIcon, ShieldCheckIcon } from "./icons";
import { SubmitButton } from "./submit-button";

interface AccountShellProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly children: ReactNode;
  readonly locale?: "ar" | "en";
  readonly surface?: "student" | "admin";
}

export function AccountShell({
  displayName,
  csrfToken,
  children,
  locale = "ar",
  surface = "student",
}: AccountShellProps) {
  const english = locale === "en";
  const prefix = `/${locale}`;
  const initial = displayName.trim().slice(0, 1) || (english ? "S" : "ط");
  const homeHref = surface === "admin" ? `${prefix}/admin` : `${prefix}/student`;
  return (
    <div
      className="min-h-[100svh] min-h-[100dvh] bg-[var(--itq-color-canvas)]"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      <header className="itq-safe-t sticky top-0 z-30 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.75rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-7">
          <Link className="inline-flex items-center gap-3 text-lg font-black" href={homeHref}>
            <BrandMark className="size-11" />
            {english ? "ITQANAK" : "إتقانك"}
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-2xl border border-[var(--itq-color-border)] px-3 py-2 sm:flex">
              <span className="grid size-8 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-sm font-black text-white">
                {initial}
              </span>
              <span className="max-w-36 truncate text-xs font-black">{displayName}</span>
            </span>
            <form action="/api/auth/logout" method="post">
              <CsrfInput token={csrfToken} />
              <input name="locale" type="hidden" value={locale} />
              <SubmitButton
                aria-label={english ? "Sign out" : "تسجيل الخروج"}
                className="size-11 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-0 text-[var(--itq-color-muted)] shadow-none hover:bg-[var(--itq-color-danger-50)] hover:text-[var(--itq-color-danger-700)]"
                pendingLabel="…"
              >
                <LogOutIcon className="size-5" />
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-7 px-4 py-7 sm:px-7 lg:grid-cols-[17rem_minmax(0,1fr)] lg:py-10">
        <aside className="self-start rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 shadow-[var(--itq-shadow-sm)] lg:sticky lg:top-6">
          <div className="mb-3 rounded-2xl bg-[var(--itq-color-surface-soft)] p-4">
            <span className="flex items-center gap-2 text-xs font-black text-[var(--itq-color-success-800)]">
              <ShieldCheckIcon className="size-4" />{" "}
              {english ? "Account settings" : "إعدادات حسابك"}
            </span>
            <p className="mt-2 text-[11px] leading-5 text-[var(--itq-color-muted)]">
              {english
                ? "Review your profile, security controls and signed-in devices."
                : "راجع بياناتك وحماية حسابك والأجهزة المسجّلة."}
            </p>
          </div>
          <AccountNavigation locale={locale} surface={surface} />
        </aside>
        <section className="min-w-0 rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-5 shadow-[var(--itq-shadow-sm)] sm:p-8 lg:p-9">
          {children}
        </section>
      </main>
    </div>
  );
}
