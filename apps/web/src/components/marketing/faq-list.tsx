import type { JSX } from "react";

import { MarketingIcon } from "./marketing-icon";

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

export function FaqList({ items }: Readonly<{ items: readonly FaqItem[] }>): JSX.Element {
  return (
    <div className="grid gap-3">
      {items.map((item, index) => (
        <details
          className="group rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-5 shadow-[var(--itq-shadow-sm)] open:border-[var(--itq-color-brand-200)] sm:px-6"
          key={item.question}
          open={index === 0}
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 font-black marker:hidden">
            <span>{item.question}</span>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)] transition group-open:rotate-45">
              <MarketingIcon className="size-4" name="check" />
            </span>
          </summary>
          <p className="border-t border-[var(--itq-color-border)] pb-5 pt-4 leading-8 text-[var(--itq-color-muted)]">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
