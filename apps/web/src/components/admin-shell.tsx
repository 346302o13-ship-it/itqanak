import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@itqanak/ui";

import { MobileWorkspaceNavProvider } from "@/lib/mobile-workspace-nav";

import { AnnouncementBanner } from "./announcement-banner";
import { PushRegistrar } from "./push-registrar";
import { ShieldCheckIcon } from "./icons";
import { InstallAppButton } from "./install-app-button";
import { AdminMobileNavigation, AdminNavigation } from "./admin-navigation";
import { NotificationCenter } from "./notification-center";
import { ThemeToggleButton } from "./theme-toggle-button";
import { AdminWorkspaceMobileNavSlot } from "./workspace-mobile-nav-slot";

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
  const initial = displayName.trim().slice(0, 1) || (english ? "A" : "م");
  return (
    <div
      className="itq-screen-min-h bg-[var(--itq-color-canvas)]"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      {workspace ? null : (
        <header className="sticky top-0 z-30 itq-safe-t border-b border-[var(--itq-color-border)]/80 bg-[var(--itq-color-canvas)]/90 backdrop-blur-xl">
          <div className="mx-auto flex h-[4.75rem] max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
            <Link
              className="inline-flex items-center gap-3 text-lg font-black"
              href={`${prefix}/admin`}
            >
              <BrandMark className="size-11" />
              <span className="hidden sm:inline">{english ? "ITQANAK" : "إتقانك"}</span>
              <span className="hidden rounded-md bg-[var(--itq-color-brand-50)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-[var(--itq-color-brand-strong)] md:inline">
                {english ? "Admin center" : "مركز الإدارة"}
              </span>
            </Link>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggleButton locale={locale} />
              <InstallAppButton compact locale={locale} surface="admin" />
              <div className="text-[var(--itq-color-muted)]">
                <NotificationCenter csrfToken={csrfToken} locale={locale} surface="admin" />
              </div>
              <Link
                className="flex min-h-11 items-center gap-2 rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 pe-3 transition hover:border-[var(--itq-color-brand-300)]"
                href={`${prefix}/account`}
              >
                <span className="grid size-8 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] text-sm font-black text-white">
                  {initial}
                </span>
                <span className="hidden max-w-36 truncate text-xs font-extrabold sm:block">
                  {displayName}
                </span>
              </Link>
            </div>
          </div>
        </header>
      )}
      {workspace ? null : <AnnouncementBanner locale={locale} />}
      <PushRegistrar csrfToken={csrfToken} />
      {workspace ? (
        <MobileWorkspaceNavProvider>
          <div className="itq-safe-t itq-screen-h mx-auto max-w-[120rem] overflow-hidden">
            <main className="h-full min-w-0 overflow-hidden">{children}</main>
          </div>
          <AdminWorkspaceMobileNavSlot locale={locale} />
        </MobileWorkspaceNavProvider>
      ) : (
        <>
          <div className="mx-auto grid max-w-[96rem] gap-7 px-4 pb-28 pt-7 sm:px-7 lg:grid-cols-[17rem_minmax(0,1fr)] lg:px-10 lg:pb-12">
            <aside className="hidden self-start lg:sticky lg:top-[6.75rem] lg:block">
              <div className="rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3">
                <div className="mb-3 rounded-[var(--itq-radius-control)] bg-[var(--itq-color-surface-soft)] p-4">
                  <div className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.14em] text-[var(--itq-color-success-700)]">
                    <ShieldCheckIcon className="size-4" />{" "}
                    {english ? "Trusted admin session" : "جلسة إدارية موثوقة"}
                  </div>
                  <p className="mt-2 truncate text-sm font-black">{displayName}</p>
                </div>
                <AdminNavigation locale={locale} />
              </div>
            </aside>
            <main className="min-w-0">{children}</main>
          </div>
          <AdminMobileNavigation locale={locale} />
        </>
      )}
    </div>
  );
}
