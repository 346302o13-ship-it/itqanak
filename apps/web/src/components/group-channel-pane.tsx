"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { renderMessageText } from "@/lib/chat-markdown";

interface GroupChannelMessage {
  readonly id: string;
  readonly senderType: "ADMIN" | "STUDENT" | "SYSTEM";
  readonly authoredByMe: boolean;
  readonly authorName?: string;
  readonly contentType: "TEXT" | "SYSTEM";
  readonly body: string;
  readonly sentAt: string;
  readonly deleted: boolean;
}

interface GroupChannelView {
  readonly messages: readonly GroupChannelMessage[];
  readonly membersCanPost: boolean;
  readonly canPost: boolean;
  readonly isAdmin: boolean;
  readonly settingsVersion: number;
  readonly unreadCount: number;
  readonly lastMessageAt?: string;
}

interface DisplayMessage extends GroupChannelMessage {
  readonly pending?: boolean;
  readonly failed?: boolean;
}

export interface GroupChannelPaneProps {
  readonly locale: "ar" | "en";
  readonly csrfToken: string | undefined;
  readonly apiBase: "/api/student/group-channel" | "/api/admin/group-channel";
  readonly backHref: string;
}

const POLL_MS = 10_000;

function authorLabel(
  message: GroupChannelMessage,
  english: boolean,
): { name: string; tone: "admin" | "me" | "peer" | "system" } {
  if (message.senderType === "SYSTEM") {
    return { name: english ? "System" : "النظام", tone: "system" };
  }
  if (message.authoredByMe) {
    return { name: english ? "You" : "أنت", tone: "me" };
  }
  if (message.senderType === "ADMIN") {
    return {
      name: message.authorName ?? (english ? "Administration" : "الإدارة"),
      tone: "admin",
    };
  }
  return {
    name: message.authorName ?? (english ? "Student" : "طالب"),
    tone: "peer",
  };
}

export function GroupChannelPane({ locale, csrfToken, apiBase, backHref }: GroupChannelPaneProps) {
  const english = locale === "en";
  const [view, setView] = useState<GroupChannelView | undefined>(undefined);
  const [outbox, setOutbox] = useState<readonly DisplayMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottom = useRef(true);

  const adminMode = apiBase === "/api/admin/group-channel" && view?.isAdmin === true;

  const markRead = useCallback(async () => {
    if (csrfToken === undefined) return;
    try {
      await fetch(`${apiBase}/read`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken }),
      });
    } catch {
      // A missed read receipt is corrected on the next open.
    }
  }, [apiBase, csrfToken]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(apiBase, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        setLoadError(true);
        return;
      }
      const next = (await response.json()) as GroupChannelView;
      setLoadError(false);
      setView(next);
      setOutbox((current) =>
        current.filter((pending) => !next.messages.some((message) => message.id === pending.id)),
      );
      if (next.unreadCount > 0) void markRead();
    } catch {
      setLoadError(true);
    }
  }, [apiBase, markRead]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const merged = useMemo<readonly DisplayMessage[]>(() => {
    const base: readonly DisplayMessage[] = view?.messages ?? [];
    return [...base, ...outbox];
  }, [view?.messages, outbox]);

  useEffect(() => {
    const element = scrollRef.current;
    if (element === null || !nearBottom.current) return;
    element.scrollTop = element.scrollHeight;
  }, [merged.length]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (element === null) return;
    nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120;
  }, []);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (body.length === 0 || csrfToken === undefined || sending) return;
    if (view !== undefined && !view.canPost) return;
    const clientMessageId = crypto.randomUUID();
    const optimistic: DisplayMessage = {
      id: `pending-${clientMessageId}`,
      senderType: view?.isAdmin === true ? "ADMIN" : "STUDENT",
      authoredByMe: true,
      contentType: "TEXT",
      body,
      sentAt: new Date().toISOString(),
      deleted: false,
      pending: true,
    };
    setOutbox((current) => [...current, optimistic]);
    setDraft("");
    nearBottom.current = true;
    setSending(true);
    try {
      const response = await fetch(apiBase, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, body, clientMessageId }),
      });
      if (!response.ok) {
        setOutbox((current) =>
          current.map((message) =>
            message.id === optimistic.id ? { ...message, pending: false, failed: true } : message,
          ),
        );
        return;
      }
      // The server list has no client id to match on, so drop the optimistic
      // row now that the post is confirmed and let refresh() bring the real one.
      setOutbox((current) => current.filter((message) => message.id !== optimistic.id));
      await refresh();
    } catch {
      setOutbox((current) =>
        current.map((message) =>
          message.id === optimistic.id ? { ...message, pending: false, failed: true } : message,
        ),
      );
    } finally {
      setSending(false);
    }
  }, [apiBase, csrfToken, draft, refresh, sending, view]);

  const togglePolicy = useCallback(async () => {
    if (view === undefined || csrfToken === undefined || policyBusy) return;
    setPolicyBusy(true);
    try {
      const response = await fetch("/api/admin/group-channel/policy", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          csrfToken,
          membersCanPost: view.membersCanPost ? "false" : "true",
          expectedVersion: String(view.settingsVersion),
        }),
      });
      if (response.ok) await refresh();
    } catch {
      // Left as-is; the toggle reflects the last confirmed state on refresh.
    } finally {
      setPolicyBusy(false);
    }
  }, [csrfToken, policyBusy, refresh, view]);

  const runAiDraft = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (prompt.length < 3 || csrfToken === undefined || aiBusy) return;
    setAiBusy(true);
    setAiError(undefined);
    try {
      const response = await fetch("/api/admin/group-channel/draft", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, prompt }),
      });
      const payload = (await response.json()) as { text?: string; error?: string };
      if (!response.ok || typeof payload.text !== "string") {
        setAiError(
          payload.error === "ASSISTANT_UNAVAILABLE"
            ? english
              ? "The assistant is unavailable right now."
              : "المساعد غير متاح حالياً."
            : english
              ? "Could not draft the announcement."
              : "تعذّرت صياغة الإعلان.",
        );
        return;
      }
      setDraft(payload.text);
      setAiOpen(false);
      setAiPrompt("");
    } catch {
      setAiError(english ? "Could not draft the announcement." : "تعذّرت صياغة الإعلان.");
    } finally {
      setAiBusy(false);
    }
  }, [aiBusy, aiPrompt, csrfToken, english]);

  const locked = view !== undefined && !view.canPost;

  return (
    <section
      aria-label={english ? "Student group channel" : "قروب الطلاب"}
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--itq-color-surface-soft)]"
    >
      <header className="flex h-[4.65rem] shrink-0 items-center gap-3 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 sm:px-5">
        <a
          aria-label={english ? "Back" : "رجوع"}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--itq-color-border)] text-[var(--itq-color-ink)] no-underline hover:bg-[var(--itq-color-surface-soft)] lg:hidden"
          href={backHref}
        >
          <span aria-hidden className="rtl:-scale-x-100">
            ←
          </span>
        </a>
        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-700)] text-white">
          <span aria-hidden>📢</span>
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-black sm:text-base">
            {english ? "Students group" : "قروب الطلاب"}
          </h1>
          <p className="truncate text-[10px] font-bold text-[var(--itq-color-muted)] sm:text-xs">
            {view?.membersCanPost === true
              ? english
                ? "Open chat — everyone can post"
                : "دردشة مفتوحة — يمكن للجميع الكتابة"
              : english
                ? "Announcements from the administration"
                : "إعلانات من الإدارة"}
          </p>
        </div>
        {adminMode && view !== undefined ? (
          <button
            className="ms-auto shrink-0 rounded-full border border-[var(--itq-color-border)] px-3 py-1.5 text-[11px] font-black text-[var(--itq-color-ink)] hover:bg-[var(--itq-color-surface-soft)] disabled:opacity-40"
            disabled={policyBusy || csrfToken === undefined}
            onClick={() => void togglePolicy()}
            type="button"
          >
            {view.membersCanPost
              ? english
                ? "Set to admin-only"
                : "اجعلها للإدارة فقط"
              : english
                ? "Open chat for everyone"
                : "افتح الدردشة للجميع"}
          </button>
        ) : null}
      </header>

      <div
        aria-label={english ? "Group messages" : "رسائل القروب"}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-6"
        onScroll={onScroll}
        ref={scrollRef}
      >
        {loadError && view === undefined ? (
          <p className="mx-auto rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-3 text-sm">
            {english ? "Could not load the group." : "تعذّر تحميل القروب."}
          </p>
        ) : null}
        {view !== undefined && merged.length === 0 ? (
          <p className="mx-auto max-w-md rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-3 text-center text-sm leading-6">
            {english
              ? "No messages yet. The administration will post announcements here."
              : "لا توجد رسائل بعد. ستنشر الإدارة الإعلانات هنا."}
          </p>
        ) : null}
        {merged.map((message) => {
          if (message.deleted) {
            return (
              <p
                className="mx-auto text-[11px] italic text-[var(--itq-color-muted)]"
                key={message.id}
              >
                {english ? "Message removed" : "تم حذف الرسالة"}
              </p>
            );
          }
          if (message.senderType === "SYSTEM") {
            return (
              <p
                className="mx-auto max-w-md rounded-full bg-[var(--itq-color-surface)] px-3 py-1 text-center text-[11px] text-[var(--itq-color-muted)]"
                dir="auto"
                key={message.id}
              >
                {message.body}
              </p>
            );
          }
          const label = authorLabel(message, english);
          const mine = label.tone === "me";
          return (
            <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`} key={message.id}>
              <span
                className={`mb-0.5 px-1 text-[10px] font-black ${
                  label.tone === "admin"
                    ? "text-[var(--itq-color-brand-strong)]"
                    : "text-[var(--itq-color-muted)]"
                }`}
              >
                {label.name}
              </span>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-7 ${
                  mine
                    ? "bg-[var(--itq-color-brand-600)] text-white"
                    : "border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]"
                } ${message.failed === true ? "opacity-60 ring-1 ring-[var(--itq-color-danger-500)]" : ""} ${
                  message.pending === true ? "opacity-70" : ""
                }`}
                dir="auto"
              >
                {renderMessageText(message.body)}
                {message.failed === true ? (
                  <button
                    className="mt-1 block text-[10px] font-bold underline"
                    onClick={() => {
                      setOutbox((current) => current.filter((entry) => entry.id !== message.id));
                      setDraft(message.body);
                    }}
                    type="button"
                  >
                    {english ? "Not sent — restore to editor" : "لم تُرسل — استعادة للتحرير"}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 sm:p-4">
        {adminMode ? (
          <div className="mb-2">
            <button
              className="rounded-full bg-[var(--itq-color-brand-50)] px-3 py-1.5 text-[11px] font-black text-[var(--itq-color-brand-strong)]"
              onClick={() => setAiOpen((open) => !open)}
              type="button"
            >
              {english ? "✨ Draft with AI" : "✨ صياغة بالذكاء الاصطناعي"}
            </button>
            {aiOpen ? (
              <div className="mt-2 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-2">
                <textarea
                  className="w-full resize-none rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 text-xs leading-6 outline-none focus:border-[var(--itq-color-brand-500)]"
                  dir="auto"
                  onChange={(event) => setAiPrompt(event.currentTarget.value)}
                  placeholder={
                    english
                      ? "What do you want to announce? e.g. new payment feature, live Sunday"
                      : "ماذا تريد أن تعلن؟ مثال: ميزة دفع جديدة، تعمل الأحد"
                  }
                  rows={2}
                  value={aiPrompt}
                />
                {aiError !== undefined ? (
                  <p className="mt-1 text-[11px] font-bold text-[var(--itq-color-danger-700)]">
                    {aiError}
                  </p>
                ) : null}
                <div className="mt-1.5 flex justify-end">
                  <button
                    className="rounded-full bg-[var(--itq-color-brand-600)] px-3 py-1.5 text-[11px] font-black text-white disabled:opacity-40"
                    disabled={aiPrompt.trim().length < 3 || aiBusy || csrfToken === undefined}
                    onClick={() => void runAiDraft()}
                    type="button"
                  >
                    {aiBusy
                      ? english
                        ? "Drafting…"
                        : "جارٍ الصياغة…"
                      : english
                        ? "Generate"
                        : "توليد"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
        {locked ? (
          <p className="rounded-xl bg-[var(--itq-color-surface-soft)] px-4 py-3 text-center text-xs font-bold text-[var(--itq-color-muted)]">
            {english ? "Only the administration can post here." : "الإرسال متاح للإدارة فقط."}
          </p>
        ) : (
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <textarea
              className="max-h-40 min-h-10 flex-1 resize-none rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-4 py-2.5 text-sm leading-6 outline-none focus:border-[var(--itq-color-brand-500)]"
              dir="auto"
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={english ? "Write a message…" : "اكتب رسالة…"}
              rows={1}
              value={draft}
            />
            <button
              className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-600)] text-white disabled:opacity-40"
              disabled={draft.trim().length === 0 || sending || csrfToken === undefined}
              type="submit"
            >
              <span aria-hidden className="rtl:-scale-x-100">
                ➤
              </span>
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
