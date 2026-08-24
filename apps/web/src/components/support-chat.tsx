"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { SupportMessage } from "@itqanak/requests";

import { CheckCheckIcon, CheckIcon, MessageIcon, SendIcon } from "./icons";

interface SupportChatProps {
  readonly csrfToken: string | undefined;
  readonly conversationId: string;
  readonly messages: readonly SupportMessage[];
  readonly locale?: "ar" | "en";
  readonly mode?: "student" | "admin";
}

function Receipt({
  status,
  english,
}: Readonly<{ status: SupportMessage["status"]; english: boolean }>) {
  if (status === "SENT") {
    return (
      <span className="inline-flex items-center gap-1">
        <CheckIcon className="size-3.5" /> {english ? "Sent" : "أُرسلت"}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1 ${status === "READ" ? "text-sky-300" : ""}`}>
      <CheckCheckIcon className="size-3.5" />
      {status === "READ" ? (english ? "Read" : "قُرئت") : english ? "Delivered" : "وصلت"}
    </span>
  );
}

export function SupportChat({
  csrfToken,
  conversationId,
  messages: initialMessages,
  locale = "ar",
  mode = "student",
}: SupportChatProps) {
  const english = locale === "en";
  const router = useRouter();
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousLastMessageId = useRef<string | undefined>(undefined);
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const apiBase =
    mode === "admin"
      ? `/api/admin/support/${encodeURIComponent(conversationId)}`
      : "/api/student/support";

  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  const latestIncoming = [...messages]
    .reverse()
    .find((message) =>
      mode === "admin" ? message.senderType !== "ADMIN" : message.senderType !== "STUDENT",
    )?.id;
  const latestMessageId = messages.at(-1)?.id;

  useEffect(() => {
    if (csrfToken === undefined || latestIncoming === undefined) return;
    const form = new URLSearchParams({ csrfToken });
    void fetch(`${apiBase}/messages/read`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }, [apiBase, csrfToken, latestIncoming]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    if (latestMessageId === undefined) return;
    const previous = previousLastMessageId.current;
    previousLastMessageId.current = latestMessageId;
    if (previous === undefined || previous === latestMessageId) return;
    if (nearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setNewMessagesAvailable(false);
    } else {
      setNewMessagesAvailable(true);
    }
  }, [latestMessageId]);

  async function send() {
    const normalized = body.trim();
    if (normalized.length === 0 || csrfToken === undefined || pending) return;
    setPending(true);
    setNotice(undefined);
    try {
      const form = new URLSearchParams({
        csrfToken,
        body: normalized,
        clientMessageId: globalThis.crypto.randomUUID(),
      });
      const response = await fetch(`${apiBase}/messages`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) throw new Error();
      setBody("");
      router.refresh();
    } catch {
      setNotice(
        english ? "The message could not be sent. Try again." : "تعذر إرسال الرسالة. حاول مجددًا.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-[var(--itq-color-border)] bg-[#f3f8f6]">
      <header className="flex items-center gap-3 border-b border-[var(--itq-color-border)] bg-white px-5 py-4">
        <span className="grid size-11 place-items-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-700)]">
          <MessageIcon className="size-5" />
        </span>
        <div>
          <h2 className="font-black">{english ? "General support" : "الدعم العام"}</h2>
          <p className="text-xs font-semibold text-[var(--itq-color-muted)]">
            {english
              ? "A private conversation independent from any request"
              : "محادثة خاصة مستقلة عن أي طلب"}
          </p>
        </div>
      </header>
      <div
        aria-label={english ? "General support messages" : "رسائل الدعم العام"}
        aria-live="polite"
        aria-relevant="additions"
        className="relative max-h-[38rem] min-h-80 overflow-y-auto p-4 sm:p-6"
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 96;
          if (nearBottomRef.current) setNewMessagesAvailable(false);
        }}
        ref={logRef}
        role="log"
      >
        {messages.length === 0 ? (
          <div className="grid min-h-64 place-items-center text-center">
            <div>
              <MessageIcon className="mx-auto size-9 text-[var(--itq-color-brand-700)]" />
              <p className="mt-3 font-black">
                {english ? "Start a support conversation" : "ابدأ محادثة مع الدعم"}
              </p>
              <p className="mt-2 text-sm text-[var(--itq-color-muted)]">
                {english
                  ? "Ask about your account or the platform without linking it to a request."
                  : "اسأل عن حسابك أو المنصة دون ربط الحديث بطلب معين."}
              </p>
            </div>
          </div>
        ) : (
          <ol className="grid gap-3">
            {messages.map((message) => {
              if (message.senderType === "SYSTEM") {
                return (
                  <li
                    className="mx-auto rounded-full bg-white px-4 py-2 text-xs font-bold text-[var(--itq-color-muted)]"
                    key={message.id}
                  >
                    {message.body}
                  </li>
                );
              }
              const mine =
                mode === "admin"
                  ? message.senderType === "ADMIN"
                  : message.senderType === "STUDENT";
              return (
                <li className={`flex ${mine ? "justify-end" : "justify-start"}`} key={message.id}>
                  <article
                    className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${
                      mine
                        ? "rounded-ee-sm bg-[var(--itq-color-brand-700)] text-white"
                        : "rounded-es-sm border border-[var(--itq-color-border)] bg-white"
                    }`}
                  >
                    {!mine ? (
                      <p className="mb-1 text-[11px] font-black text-[var(--itq-color-brand-700)]">
                        {mode === "admin"
                          ? english
                            ? "Student"
                            : "الطالب"
                          : english
                            ? "ITQANAK support"
                            : "دعم إتقانك"}
                      </p>
                    ) : null}
                    <p className="whitespace-pre-wrap leading-7" dir="auto">
                      {message.body}
                    </p>
                    <footer
                      className={`mt-2 flex items-center justify-end gap-2 text-[10px] ${mine ? "text-white/75" : "text-[var(--itq-color-muted)]"}`}
                    >
                      <time dateTime={message.sentAt.toISOString()}>
                        {new Intl.DateTimeFormat(english ? "en-GB" : "ar-SA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(message.sentAt)}
                      </time>
                      {mine ? <Receipt english={english} status={message.status} /> : null}
                    </footer>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} />
        {newMessagesAvailable ? (
          <button
            className="sticky bottom-2 mx-auto mt-3 block rounded-full bg-[var(--itq-color-ink)] px-4 py-2 text-xs font-black text-white shadow-lg"
            onClick={() => {
              endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              nearBottomRef.current = true;
              setNewMessagesAvailable(false);
            }}
            type="button"
          >
            {english ? "New messages" : "رسائل جديدة"}
          </button>
        ) : null}
      </div>
      <div className="border-t border-[var(--itq-color-border)] bg-white p-3 sm:p-4">
        {notice === undefined ? null : (
          <p
            className="mb-3 rounded-xl bg-red-50 px-4 py-2 text-xs font-bold text-red-800"
            role="alert"
          >
            {notice}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-[var(--itq-color-border)] px-4 py-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
            dir="auto"
            maxLength={10_000}
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder={english ? "Write your message…" : "اكتب رسالتك…"}
            rows={1}
            value={body}
          />
          <button
            aria-label={english ? "Send message" : "إرسال الرسالة"}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-white disabled:opacity-50"
            disabled={pending || body.trim().length === 0 || csrfToken === undefined}
            onClick={() => void send()}
            type="button"
          >
            <SendIcon className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
        <p className="mt-2 text-[10px] font-semibold text-[var(--itq-color-muted)]">
          {english
            ? "Do not send passwords or payment-card details."
            : "لا ترسل كلمات المرور أو بيانات البطاقات البنكية."}
        </p>
      </div>
    </section>
  );
}
