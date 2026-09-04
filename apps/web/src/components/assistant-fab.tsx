"use client";

import { useState } from "react";

import { AssistantChat } from "./assistant-chat";
import { CloseIcon, MessageIcon } from "./icons";

export interface AssistantFabProps {
  readonly csrfToken: string | undefined;
  readonly locale: "ar" | "en";
}

const copy = {
  ar: {
    title: "مساعد إتقانك",
    greeting: "أهلاً! اسألني عن الخدمات، الأسعار، أو طريقة العمل في المنصة.",
    placeholder: "اكتب سؤالك…",
    open: "افتح المساعد",
    close: "إغلاق المساعد",
  },
  en: {
    title: "ITQANAK Assistant",
    greeting: "Hi! Ask me about services, prices, or how the platform works.",
    placeholder: "Type your question…",
    open: "Open assistant",
    close: "Close assistant",
  },
} as const;

export function AssistantFab({ csrfToken, locale }: AssistantFabProps) {
  const [open, setOpen] = useState(false);
  const text = copy[locale];

  return (
    <div className="fixed bottom-4 end-4 z-40 flex flex-col items-end gap-3 sm:bottom-6 sm:end-6 print:hidden">
      {open ? (
        <AssistantChat
          csrfToken={csrfToken}
          endpoint="/api/assistant/visitor"
          greeting={text.greeting}
          locale={locale}
          placeholder={text.placeholder}
          title={text.title}
          variant="compact"
        />
      ) : null}
      <button
        aria-expanded={open}
        aria-label={open ? text.close : text.open}
        className="grid size-14 place-items-center rounded-full bg-[var(--itq-color-brand-700)] text-white shadow-xl transition hover:bg-[var(--itq-color-brand-800)]"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? <CloseIcon className="size-6" /> : <MessageIcon className="size-6" />}
      </button>
    </div>
  );
}
