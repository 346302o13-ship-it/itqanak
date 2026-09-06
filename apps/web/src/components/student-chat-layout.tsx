"use client";

import type { ReactNode } from "react";

type ChatView = "admin" | "assistant" | "group";

export interface StudentChatLayoutProps {
  readonly locale: "ar" | "en";
  readonly active: ChatView;
  /** True on the bare /student/support URL — the list is the mobile view. */
  readonly showListOnMobile: boolean;
  readonly groupUnread: number;
  readonly groupOpen: boolean;
  readonly children: ReactNode;
}

interface Entry {
  readonly view: ChatView;
  readonly href: string;
  readonly label: string;
  readonly hint: string;
  readonly glyph: string;
  readonly badge?: number;
}

export function StudentChatLayout({
  locale,
  active,
  showListOnMobile,
  groupUnread,
  groupOpen,
  children,
}: StudentChatLayoutProps) {
  const english = locale === "en";
  const base = `/${locale}/student/support`;
  const entries: readonly Entry[] = [
    {
      view: "admin",
      href: `${base}?view=admin`,
      label: english ? "Administration" : "الإدارة",
      hint: english ? "Your private support chat" : "محادثة الدعم الخاصة بك",
      glyph: "🎓",
    },
    {
      view: "assistant",
      href: `${base}?assistant=1`,
      label: english ? "AI Assistant" : "المساعد",
      hint: english ? "Ask about requests and dues" : "اسأل عن طلباتك ومستحقاتك",
      glyph: "✨",
    },
    {
      view: "group",
      href: `${base}?view=group`,
      label: english ? "Students group" : "قروب الطلاب",
      hint: groupOpen
        ? english
          ? "Open chat for everyone"
          : "دردشة مفتوحة للجميع"
        : english
          ? "Announcements from the administration"
          : "إعلانات من الإدارة",
      glyph: "📢",
      ...(groupUnread > 0 ? { badge: groupUnread } : {}),
    },
  ];

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <aside
        aria-label={english ? "Conversations" : "المحادثات"}
        className={`${showListOnMobile ? "flex" : "hidden"} min-h-0 flex-col border-e border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] lg:flex`}
      >
        <header className="flex h-[4.65rem] shrink-0 items-center gap-3 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4">
          <a
            aria-label={english ? "Back to the student portal" : "العودة إلى بوابة الطالب"}
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--itq-color-border)] text-[var(--itq-color-ink)] no-underline hover:bg-[var(--itq-color-surface-soft)]"
            href={`/${locale}/student`}
          >
            <span aria-hidden className="rtl:-scale-x-100">
              ←
            </span>
          </a>
          <h1 className="text-base font-black">{english ? "Messages" : "المحادثات"}</h1>
        </header>
        <nav className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {entries.map((entry) => {
            const current = active === entry.view;
            const badge = entry.badge ?? 0;
            const unread = badge > 0;
            return (
              <a
                aria-current={current ? "page" : undefined}
                className={`relative flex items-center gap-3 border-b border-[var(--itq-color-border)]/50 px-2.5 py-3.5 no-underline transition last:border-b-0 ${
                  current ? "bg-[var(--itq-color-brand-50)]" : "hover:bg-[var(--itq-color-surface)]"
                }`}
                href={entry.href}
                key={entry.view}
              >
                {current ? (
                  <span className="absolute inset-y-2.5 start-0 w-1 rounded-full bg-[var(--itq-color-brand-600)]" />
                ) : null}
                <span
                  className={`grid size-12 shrink-0 place-items-center rounded-full text-xl ${
                    current
                      ? "bg-[var(--itq-color-brand-100)]"
                      : "bg-[var(--itq-color-surface)] shadow-sm"
                  }`}
                >
                  <span aria-hidden>{entry.glyph}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate text-sm ${
                      current
                        ? "font-black text-[var(--itq-color-brand-strong)]"
                        : "font-black text-[var(--itq-color-ink)]"
                    }`}
                  >
                    {entry.label}
                  </span>
                  <span
                    className={`mt-0.5 block truncate text-[11px] ${
                      unread
                        ? "font-bold text-[var(--itq-color-ink)]"
                        : "text-[var(--itq-color-muted)]"
                    }`}
                  >
                    {entry.hint}
                  </span>
                </span>
                {unread ? (
                  <span className="grid min-w-[1.25rem] shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-600)] px-1.5 py-0.5 text-[11px] font-black text-white">
                    {badge > 99 ? "99+" : badge}
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="shrink-0 text-[var(--itq-color-muted)] opacity-40 rtl:-scale-x-100"
                  >
                    ›
                  </span>
                )}
              </a>
            );
          })}
        </nav>
      </aside>

      <div className={`${showListOnMobile ? "hidden" : "flex"} min-h-0 min-w-0 flex-col lg:flex`}>
        {children}
      </div>
    </div>
  );
}
