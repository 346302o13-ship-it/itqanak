"use client";

import { useRef, useState, type ReactNode } from "react";

import { MessageIcon, SendIcon } from "./icons";

interface ChatAction {
  readonly label: string;
  readonly href: string;
}

interface DisplayMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly actions?: readonly ChatAction[];
}

interface AssistantReplyWire {
  readonly text?: string;
  readonly actions?: readonly ChatAction[];
  readonly history?: unknown;
  readonly error?: string;
}

export interface AssistantChatProps {
  readonly endpoint: string;
  readonly csrfToken: string | undefined;
  readonly locale: "ar" | "en";
  readonly title: string;
  readonly greeting: string;
  readonly placeholder: string;
  /** Compact fits a floating popover; full stretches to its container, used
   *  on the dedicated assistant pages. */
  readonly variant?: "compact" | "full";
}

/** `**bold**` spans only — split and wrap, never dangerouslySetInnerHTML, so
 *  there is no HTML-injection surface even though this text came from a
 *  model reply. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
        <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>
      ) : (
        <span key={`${keyPrefix}-${index}`}>{part}</span>
      ),
    );
}

/**
 * The assistant is asked (system prompt) to format with plain text, **bold**,
 * and "- " bullet lines only — this renders exactly that lightweight subset,
 * so a reply never shows raw markdown characters in the chat bubble.
 */
function renderMessageText(text: string): ReactNode {
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];

  const flushList = (key: string) => {
    if (listItems.length === 0) return;
    blocks.push(
      <ul className="my-1 ms-5 list-disc space-y-0.5" key={`ul-${key}`}>
        {listItems.map((item, index) => (
          <li key={index}>{renderInline(item, `li-${key}-${index}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  };

  text.split("\n").forEach((line, index) => {
    const bulletMatch = /^[-*]\s+(.*)/.exec(line.trim());
    if (bulletMatch) {
      listItems.push(bulletMatch[1] ?? "");
      return;
    }
    flushList(String(index));
    if (line.trim().length === 0) {
      blocks.push(<div className="h-2" key={`gap-${index}`} />);
    } else {
      blocks.push(
        <p className="leading-6" key={`p-${index}`}>
          {renderInline(line, `p-${index}`)}
        </p>,
      );
    }
  });
  flushList("end");
  return blocks;
}

function errorMessage(code: string | undefined, english: boolean): string {
  if (code === "RATE_LIMITED") {
    return english
      ? "You've sent a lot of messages — please wait a bit and try again."
      : "أرسلت عدداً كبيراً من الرسائل — انتظر قليلاً ثم حاول مجدداً.";
  }
  if (code === "ASSISTANT_UNAVAILABLE") {
    return english
      ? "The assistant is temporarily unavailable. Please try again shortly, or reach us on WhatsApp."
      : "المساعد غير متاح مؤقتاً. حاول مجدداً بعد قليل، أو تواصل معنا عبر واتساب.";
  }
  return english
    ? "Something went wrong sending that. Please try again."
    : "حدث خطأ أثناء إرسال الرسالة. حاول مجدداً.";
}

export function AssistantChat({
  csrfToken,
  endpoint,
  greeting,
  locale,
  placeholder,
  title,
  variant = "full",
}: AssistantChatProps) {
  const english = locale === "en";
  const [messages, setMessages] = useState<readonly DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string>();
  const historyRef = useRef<unknown>(undefined);
  const logRef = useRef<HTMLDivElement>(null);

  function scrollToEnd(): void {
    requestAnimationFrame(() => {
      const el = logRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  async function send(): Promise<void> {
    const text = input.trim();
    if (text.length === 0 || sending || csrfToken === undefined) return;
    setInput("");
    setNotice(undefined);
    setMessages((current) => [...current, { role: "user", text }]);
    scrollToEnd();
    setSending(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "X-Itqanak-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ message: text, locale, history: historyRef.current ?? [] }),
      });
      const payload = (await response.json().catch(() => ({}))) as AssistantReplyWire;
      if (!response.ok) {
        setNotice(errorMessage(payload.error, english));
        return;
      }
      historyRef.current = payload.history ?? historyRef.current;
      setMessages((current) => [
        ...current,
        { role: "assistant", text: payload.text ?? "", actions: payload.actions ?? [] },
      ]);
      scrollToEnd();
    } catch {
      setNotice(errorMessage(undefined, english));
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`flex min-h-0 flex-col overflow-hidden rounded-[var(--itq-radius-panel)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] ${
        variant === "compact" ? "h-[32rem] w-[min(24rem,88vw)] shadow-2xl" : "h-full"
      }`}
    >
      <header className="flex shrink-0 items-center gap-2.5 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-4 py-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] text-white">
          <MessageIcon className="size-4.5" />
        </span>
        <p className="text-sm font-black">{title}</p>
      </header>

      <div
        className="itq-scroll itq-chat-bg min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-4"
        ref={logRef}
      >
        <div
          className="max-w-[85%] rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-3 text-sm leading-6"
          dir="auto"
        >
          {greeting}
        </div>
        {messages.map((message, index) => (
          <div
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            key={index}
          >
            <div
              className={`max-w-[85%] rounded-[var(--itq-radius-card)] px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "bg-[var(--itq-color-brand-700)] text-white"
                  : "border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]"
              }`}
              dir="auto"
            >
              {message.role === "assistant" ? (
                renderMessageText(message.text)
              ) : (
                <p className="whitespace-pre-wrap">{message.text}</p>
              )}
              {message.actions !== undefined && message.actions.length > 0 ? (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {message.actions.map((action) => (
                    <a
                      className="inline-flex min-h-8 items-center rounded-[var(--itq-radius-control)] border border-[var(--itq-color-accent-500)] bg-[var(--itq-color-surface)] px-3 text-xs font-black text-[var(--itq-color-brand-strong)] no-underline transition hover:bg-[var(--itq-color-brand-50)]"
                      href={action.href}
                      key={action.href + action.label}
                      rel={action.href.startsWith("http") ? "noreferrer noopener" : undefined}
                      target={action.href.startsWith("http") ? "_blank" : undefined}
                    >
                      {action.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
        {sending ? (
          <div className="flex justify-start">
            <div className="rounded-[var(--itq-radius-card)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-3 text-sm text-[var(--itq-color-muted)]">
              {english ? "Typing…" : "يكتب…"}
            </div>
          </div>
        ) : null}
      </div>

      {notice === undefined ? null : (
        <p
          aria-live="polite"
          className="shrink-0 border-t border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] px-4 py-2 text-xs font-bold text-[var(--itq-color-danger-950)]"
        >
          {notice}
        </p>
      )}

      <form
        className="flex shrink-0 items-end gap-2 border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <textarea
          className="max-h-28 min-h-11 flex-1 resize-none rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-3 py-2.5 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
          dir="auto"
          disabled={sending}
          onChange={(event) => setInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={placeholder}
          rows={1}
          value={input}
        />
        <button
          aria-label={english ? "Send" : "إرسال"}
          className="grid size-11 shrink-0 place-items-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] text-white transition hover:bg-[var(--itq-color-brand-800)] disabled:cursor-wait disabled:opacity-60"
          disabled={sending || input.trim().length === 0}
          type="submit"
        >
          <SendIcon className="size-4.5 rtl:-scale-x-100" />
        </button>
      </form>
    </div>
  );
}
