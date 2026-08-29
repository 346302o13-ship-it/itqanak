"use client";

import { useRef, type ReactNode } from "react";

interface ConfirmSubmitButtonProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tone?: "danger" | "ghost-danger";
  readonly locale?: "ar" | "en";
}

const toneClass: Record<"danger" | "ghost-danger", string> = {
  danger:
    "bg-[var(--itq-color-danger-700)] text-white hover:bg-[var(--itq-color-danger-800)] focus-visible:outline-[var(--itq-color-danger-600)]",
  "ghost-danger":
    "border border-[var(--itq-color-danger-100)] bg-[var(--itq-color-surface)] text-[var(--itq-color-danger-700)] hover:bg-[var(--itq-color-danger-50)] focus-visible:outline-[var(--itq-color-danger-600)]",
};

/**
 * Drop-in replacement for a destructive submit button: the visible button opens
 * a modal confirm, and only "confirm" submits the surrounding form. Native
 * <dialog> — Escape and backdrop click cancel.
 */
export function ConfirmSubmitButton({
  children,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  locale = "ar",
}: ConfirmSubmitButtonProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClass[tone]}`}
        onClick={() => {
          dialogRef.current?.showModal();
          window.requestAnimationFrame(() => confirmRef.current?.focus());
        }}
        type="button"
      >
        {children}
      </button>
      <dialog
        aria-labelledby="confirm-title"
        className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 text-start shadow-[var(--itq-shadow-float)] backdrop:bg-black/40"
        dir={locale === "en" ? "ltr" : "rtl"}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
        ref={dialogRef}
      >
        <h2 className="text-lg font-black" id="confirm-title">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-7 text-[var(--itq-color-muted)]">{body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] px-4 py-2 text-sm font-bold text-[var(--itq-color-ink-soft)] transition hover:bg-[var(--itq-color-surface-soft)]"
            onClick={() => dialogRef.current?.close()}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 ${toneClass.danger}`}
            onClick={() => {
              dialogRef.current?.close();
              dialogRef.current?.closest("form")?.requestSubmit();
            }}
            ref={confirmRef}
            type="button"
          >
            {confirmLabel}
          </button>
        </div>
      </dialog>
    </>
  );
}
