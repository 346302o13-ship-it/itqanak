"use client";

import { useRef, useState } from "react";

interface PaymentReceiptUploaderProps {
  readonly dueId: string;
  readonly csrfToken: string | undefined;
  readonly locale: "ar" | "en";
  /** Already has a pending submission awaiting review. */
  readonly pending?: boolean;
}

/**
 * "I paid — here's the proof": the student uploads a receipt image, it lands in
 * their conversation attachments, and a payment-receipt submission is opened for
 * the administrator to accept (which marks the due paid) or reject.
 */
export function PaymentReceiptUploader({
  dueId,
  csrfToken,
  locale,
  pending = false,
}: PaymentReceiptUploaderProps) {
  const english = locale === "en";
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(pending ? "done" : "idle");
  const [message, setMessage] = useState<string>();

  async function onFile(file: File): Promise<void> {
    if (csrfToken === undefined) return;
    setState("busy");
    setMessage(english ? "Uploading…" : "جارٍ الرفع…");
    try {
      const upload = await fetch("/api/student/conversation/attachments", {
        method: "POST",
        body: file,
        credentials: "same-origin",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-Itqanak-CSRF-Token": csrfToken,
          "X-Itqanak-Filename": encodeURIComponent(file.name),
        },
      });
      const uploaded = (await upload.json().catch(() => ({}))) as {
        attachment?: { id?: string };
        message?: string;
      };
      if (!upload.ok || uploaded.attachment?.id === undefined) {
        throw new Error(uploaded.message ?? "upload_failed");
      }
      const submit = await fetch(`/api/student/finance/dues/${encodeURIComponent(dueId)}/receipt`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ csrfToken, attachmentId: uploaded.attachment.id }),
      });
      const result = (await submit.json().catch(() => ({}))) as { message?: string };
      if (!submit.ok) throw new Error(result.message ?? "submit_failed");
      setState("done");
      setMessage(
        english
          ? "Receipt sent. Awaiting the team's review."
          : "تم إرسال الإيصال. بانتظار مراجعة الإدارة.",
      );
    } catch (error: unknown) {
      setState("error");
      setMessage(
        error instanceof Error && error.message.length < 200 && !error.message.endsWith("_failed")
          ? error.message
          : english
            ? "The receipt could not be sent. Try again."
            : "تعذر إرسال الإيصال. حاول مجددًا.",
      );
    } finally {
      if (fileRef.current !== null) fileRef.current.value = "";
    }
  }

  if (state === "done") {
    return (
      <p className="mt-3 rounded-xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] px-3 py-2 text-xs font-bold text-[var(--itq-color-warning-900)]">
        {message ??
          (english
            ? "Receipt submitted — awaiting review."
            : "تم إرسال الإيصال — بانتظار المراجعة.")}
      </p>
    );
  }

  return (
    <div className="mt-3">
      <input
        accept="image/*,application/pdf"
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file !== undefined) void onFile(file);
        }}
        ref={fileRef}
        type="file"
      />
      <button
        className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)] disabled:opacity-50"
        disabled={state === "busy"}
        onClick={() => fileRef.current?.click()}
        type="button"
      >
        {state === "busy"
          ? (message ?? (english ? "Uploading…" : "جارٍ الرفع…"))
          : english
            ? "I paid — upload receipt"
            : "دفعت — ارفع الإيصال"}
      </button>
      {state === "error" && message !== undefined ? (
        <p className="mt-2 text-xs font-bold text-[var(--itq-color-danger-800)]">{message}</p>
      ) : null}
    </div>
  );
}
