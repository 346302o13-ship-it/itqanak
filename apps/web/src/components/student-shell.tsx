import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@itqanak/ui";

import { CsrfInput } from "./auth-shell";
import { LogOutIcon, ShieldCheckIcon, WhatsAppIcon } from "./icons";
import { InstallAppButton } from "./install-app-button";
import { NotificationCenter } from "./notification-center";
import { StudentMobileNavigation, StudentNavigation } from "./student-navigation";
import { StudentSupportFab } from "./student-support-fab";
import { SubmitButton } from "./submit-button";
import { supportWhatsAppHref } from "@/lib/support-contact";

interface StudentShellProps {
  readonly displayName: string;
  readonly csrfToken: string | undefined;
  readonly children: ReactNode;
  readonly locale?: "ar" | "en";
  /** Removes the dashboard card and navigation around focused tools such as chat. */
  readonly workspace?: boolean;
}

export function StudentShell({
  displayName,
  csrfToken,
  children,
  locale = "ar",
  workspace = false,
}: StudentShellProps) {
  const english = locale === "en";
  const prefix = `/${locale}`;
  const initial = displayName.trim().slice(0, 1) || (english ? "S" : "ط");
  return (
    <div
      className="min-h-screen bg-[var(--itq-color-canvas)]"
      dir={english ? "ltr" : "rtl"}
      lang={locale}
    >
      <header className="sticky top-0 z-30 border-b border-[var(--itq-color-border)]/80 bg-[var(--itq-color-canvas)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.75rem] max-w-[92rem] items-center justify-between gap-4 px-4 sm:px-7 lg:px-10">
          <Link
            className="inline-flex items-center gap-3 text-lg font-black"
            href={`${prefix}/student`}
          >
            <BrandMark className="size-11" />
            <span className="hidden sm:inline">{english ? "ITQANAK" : "إتقانك"}</span>
            <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800 md:inline">
              {english ? "STUDENT PORTAL" : "بوابة الطالب"}
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <InstallAppButton compact locale={locale} surface="student" />
            <div className="text-[var(--itq-color-muted)]">
              <NotificationCenter csrfToken={csrfToken} locale={locale} surface="student" />
            </div>
            <Link
              className="flex min-h-11 items-center gap-2 rounded-2xl border border-[var(--itq-color-border)] bg-white px-2 pe-3"
              href={`${prefix}/account`}
            >
              <span className="grid size-8 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-sm font-black text-white">
                {initial}
              </span>
              <span className="hidden max-w-36 truncate text-xs font-extrabold sm:block">
                {displayName}
              </span>
            </Link>
            <form action="/api/auth/logout" method="post">
              <CsrfInput token={csrfToken} />
              <input name="locale" type="hidden" value={locale} />
              <SubmitButton
                aria-label={english ? "Sign out" : "تسجيل الخروج"}
                className="size-11 rounded-2xl border border-[var(--itq-color-border)] bg-white p-0 text-[var(--itq-color-muted)] shadow-none hover:bg-red-50 hover:text-red-700"
                pendingLabel="…"
              >
                <LogOutIcon className="size-5" />
              </SubmitButton>
            </form>
          </div>
        </div>
      </header>

      <div
        className={
          workspace
            ? "mx-auto h-[calc(100dvh-4.75rem)] max-w-[120rem] overflow-hidden"
            : "mx-auto grid max-w-[92rem] gap-7 px-4 pb-28 pt-6 sm:px-7 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:px-10 lg:pb-12 lg:pt-8"
        }
      >
        {workspace ? null : (
          <aside className="hidden self-start lg:sticky lg:top-[6.75rem] lg:block">
            <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-3 shadow-[var(--itq-shadow-sm)]">
              <div className="mb-3 rounded-2xl bg-[var(--itq-color-surface-soft)] p-4">
                <p className="text-xs font-bold text-[var(--itq-color-muted)]">
                  {english ? "Welcome back" : "مرحباً بعودتك"}
                </p>
                <p className="mt-1 truncate font-black">{displayName}</p>
              </div>
              <StudentNavigation locale={locale} />
              <div className="mx-2 my-4 h-px bg-[var(--itq-color-border)]" />
              <a
                className="group flex items-start gap-3 rounded-2xl bg-[var(--itq-color-whatsapp-50)] p-3.5 text-[var(--itq-color-whatsapp-800)] transition hover:bg-[var(--itq-color-whatsapp-100)]"
                href={supportWhatsAppHref(
                  locale,
                  english ? "Student portal support" : "مساعدة داخل بوابة الطالب",
                )}
                rel="noreferrer"
                target="_blank"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-whatsapp-600)] text-white">
                  <WhatsAppIcon className="size-5" />
                </span>
                <span>
                  <span className="block text-sm font-black">
                    {english ? "Need help?" : "تحتاج مساعدة؟"}
                  </span>
                  <span className="mt-1 block text-[11px] font-semibold leading-5 text-[var(--itq-color-whatsapp-muted)]">
                    {english ? "Chat with support on WhatsApp" : "تحدث مع الدعم عبر واتساب"}
                  </span>
                </span>
              </a>
              <div className="mt-3 flex items-center gap-2 px-3 py-2 text-[10px] font-bold text-[var(--itq-color-muted)]">
                <ShieldCheckIcon className="size-4 text-emerald-700" />
                {english ? "Secure connection and private files" : "اتصال آمن وملفات خاصة"}
              </div>
            </div>
          </aside>
        )}

        <main className={workspace ? "h-full min-w-0 overflow-hidden" : "min-w-0"}>
          {workspace ? (
            children
          ) : (
            <div className="rounded-[1.75rem] border border-[var(--itq-color-border)] bg-white p-5 shadow-[var(--itq-shadow-sm)] sm:p-8 lg:p-9">
              {children}
            </div>
          )}
        </main>
      </div>
      {workspace ? null : <StudentMobileNavigation locale={locale} />}
      {workspace ? null : <StudentSupportFab locale={locale} />}
    </div>
  );
}
