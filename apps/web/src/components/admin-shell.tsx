import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@itqanak/ui";

import { AnnouncementBanner } from "./announcement-banner";
import { PushRegistrar } from "./push-registrar";
import { CsrfInput } from "./auth-shell";
import { LogOutIcon, ShieldCheckIcon } from "./icons";
import { InstallAppButton } from "./install-app-button";
import { AdminMobileNavigation, AdminNavigation } from "./admin-navigation";
import { NotificationCenter } from "./notification-center";
import { SubmitButton } from "./submit-button";

interface AdminShellProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly children: ReactNode;
  readonly locale?: "ar" | "en";
  /** Removes the dashboard chrome around focused tools such as the unified inbox. */
  readonly workspace?: boolean;
}

export function AdminShell({
  displayName,
  csrfToken,
  children,
  locale = "ar",
  workspace = false,
}: AdminShellProps) {
  const english = locale === "en";
  const prefix = `/${locale}`;
  return (
    <div
      className="min-h-[100svh] min-h-[100dvh] bg-[var(--itq-color-canvas)]"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      <header className="sticky top-0 z-30 itq-safe-t border-b border-[var(--itq-color-border)] bg-[var(--itq-color-ink-deep)]/95 text-white backdrop-blur-xl">
        <div className="mx-auto flex h-[4.75rem] max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <Link className="inline-flex items-center gap-3 font-black" href={`${prefix}/admin`}>
            <BrandMark className="size-11 bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)]" />
            <span className="hidden sm:inline">{english ? "ITQANAK" : "إتقانك"}</span>
            <span className="hidden rounded-full bg-white/10 px-2.5 py-1 text-[10px] md:inline">
              {english ? "ADMIN CENTER" : "مركز الإدارة"}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <InstallAppButton
              className="border-white/15 bg-white/10 text-white shadow-none hover:border-white/25 hover:bg-white/15"
              compact
              locale={locale}
              surface="admin"
            />
            <NotificationCenter csrfToken={csrfToken} locale={locale} surface="admin" />
            <span className="hidden rounded-2xl bg-white/10 px-4 py-3 text-xs font-black sm:inline">
              {displayName}
            </span>
            <form action="/api/auth/logout" method="post">
              <CsrfInput token={csrfToken} />
              <input name="application" type="hidden" value="admin" />
              <input name="locale" type="hidden" value={locale} />
              <SubmitButton
                aria-label={english ? "Sign out" : "تسجيل الخروج"}
                className="size-11 bg-white/10 p-0 text-white shadow-none hover:bg-[color-mix(in_srgb,var(--itq-color-danger-500)_22%,transparent)]"
                pendingLabel="…"
              >
                <LogOutIcon className="size-5" />
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>
      <AnnouncementBanner locale={locale} />
      <PushRegistrar csrfToken={csrfToken} />
      <div
        className={
          workspace
            ? "mx-auto h-[calc(100dvh-4.75rem-env(safe-area-inset-top))] max-w-[120rem] overflow-hidden"
            : "mx-auto grid max-w-[96rem] gap-7 px-4 pb-28 pt-7 sm:px-7 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-10 lg:pb-12"
        }
      >
        {workspace ? null : (
          <aside className="hidden self-start lg:sticky lg:top-[6.75rem] lg:block">
            <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 shadow-[var(--itq-shadow-sm)]">
              <div className="mb-3 rounded-2xl bg-[var(--itq-color-brand-50)] p-4">
                <div className="flex items-center gap-2 text-xs font-black text-[var(--itq-color-success-800)]">
                  <ShieldCheckIcon className="size-4" />{" "}
                  {english ? "Trusted admin session" : "جلسة إدارية موثوقة"}
                </div>
                <p className="mt-2 truncate text-sm font-black">{displayName}</p>
              </div>
              <AdminNavigation locale={locale} />
            </div>
          </aside>
        )}
        <main className={workspace ? "h-full min-w-0 overflow-hidden" : "min-w-0"}>{children}</main>
      </div>
      {workspace ? null : <AdminMobileNavigation locale={locale} />}
    </div>
  );
}
