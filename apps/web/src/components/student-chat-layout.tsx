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
        <nav className="min-h-0 flex-1 overflow-y-auto p-2">
          {entries.map((entry) => (
            <a
              aria-current={active === entry.view ? "page" : undefined}
              className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-3 no-underline transition ${
                active === entry.view
                  ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                  : "text-[var(--itq-color-ink)] hover:bg-[var(--itq-color-surface)]"
              }`}
              href={entry.href}
              key={entry.view}
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--itq-color-surface)] text-lg">
                <span aria-hidden>{entry.glyph}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-black">{entry.label}</span>
                <span className="block truncate text-[11px] text-[var(--itq-color-muted)]">
                  {entry.hint}
                </span>
              </span>
              {entry.badge !== undefined ? (
                <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-600)] px-1.5 text-[11px] font-black text-white">
                  {entry.badge > 99 ? "99+" : entry.badge}
                </span>
              ) : null}
            </a>
          ))}
        </nav>
      </aside>

      <div className={`${showListOnMobile ? "hidden" : "flex"} min-h-0 min-w-0 flex-col lg:flex`}>
        {children}
      </div>
    </div>
  );
}
