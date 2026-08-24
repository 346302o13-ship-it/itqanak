"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface AttachmentUploadProps {
  readonly csrfToken: string | undefined;
  readonly requestNumber: string;
  readonly requestVersion: number;
  readonly maximumBytes: number;
  readonly locale?: "ar" | "en";
}

interface UploadResult {
  readonly requestVersion?: number;
  readonly message?: string;
  readonly error?: string;
}

const uploadMimeByExtension: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function uploadMimeType(file: File): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  return uploadMimeByExtension[extension] ?? (file.type || "application/octet-stream");
}

function megabytes(value: number, locale: "ar" | "en"): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ar-SA", {
    maximumFractionDigits: 1,
  }).format(value / (1024 * 1024));
}

export function AttachmentUpload({
  csrfToken,
  requestNumber,
  requestVersion,
  maximumBytes,
  locale = "ar",
}: AttachmentUploadProps) {
  const english = locale === "en";
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(requestVersion);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string>();
  const [success, setSuccess] = useState(false);

  async function upload() {
    const file = fileInput.current?.files?.[0];
    if (file === undefined) {
      setSuccess(false);
      setMessage(english ? "Choose a file first." : "اختر ملفاً أولاً.");
      return;
    }
    if (file.size < 1 || file.size > maximumBytes) {
      setSuccess(false);
      setMessage(
        english
          ? `The file must not exceed ${megabytes(maximumBytes, locale)} MB.`
          : `يجب ألا يتجاوز حجم الملف ${megabytes(maximumBytes, locale)} ميجابايت.`,
      );
      return;
    }
    if (csrfToken === undefined || csrfToken.length < 32) {
      setSuccess(false);
      setMessage(
        english
          ? "The page expired. Refresh it and try again."
          : "انتهت صلاحية الصفحة. حدّثها ثم أعد المحاولة.",
      );
      return;
    }

    setPending(true);
    setMessage(undefined);
    try {
      const declaredMimeType = uploadMimeType(file);
      const response = await fetch(
        `/api/student/requests/${encodeURIComponent(requestNumber)}/attachments`,
        {
          method: "POST",
          body: file,
          credentials: "same-origin",
          headers: {
            "Content-Type": declaredMimeType,
            "X-Itqanak-CSRF-Token": csrfToken,
            "X-Itqanak-Filename": encodeURIComponent(file.name),
            "X-Itqanak-Request-Version": String(version),
          },
        },
      );
      const result = (await response.json().catch(() => ({}))) as UploadResult;
      if (!response.ok) {
        setSuccess(false);
        setMessage(
          (english ? undefined : result.message) ??
            (english
              ? "The file could not be uploaded. Check its type and size, then retry."
              : "تعذر رفع الملف. راجع نوعه وحجمه ثم حاول مجدداً."),
        );
        if (result.error === "VERSION_CONFLICT") {
          router.refresh();
        }
        return;
      }
      if (typeof result.requestVersion === "number") {
        setVersion(result.requestVersion);
      }
      if (fileInput.current !== null) {
        fileInput.current.value = "";
      }
      setSuccess(true);
      setMessage(
        english
          ? "The file was uploaded and saved in private storage."
          : "تم رفع الملف وحفظه في التخزين الخاص.",
      );
      router.refresh();
    } catch {
      setSuccess(false);
      setMessage(
        english
          ? "The upload service could not be reached. Please try again."
          : "تعذر الاتصال بخدمة الرفع. حاول مجدداً.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--itq-color-border)] p-5">
      <label className="text-sm font-black" htmlFor="requestAttachment">
        {english ? "Add one file" : "إضافة ملف واحد"}
      </label>
      <input
        accept=".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webm,.ogg,.mp3,.wav"
        className="mt-3 block w-full rounded-xl border border-[var(--itq-color-border)] bg-white p-3 text-sm"
        disabled={pending}
        id="requestAttachment"
        ref={fileInput}
        type="file"
      />
      <p className="mt-2 text-xs leading-6 text-[var(--itq-color-muted)]">
        {english
          ? `Allowed: documents, images and voice messages (WebM, OGG, MP3 and WAV). Maximum ${megabytes(maximumBytes, locale)} MB per file.`
          : `الأنواع المسموحة: المستندات والصور والرسائل الصوتية (WebM وOGG وMP3 وWAV). الحد الأقصى لهذا الطلب ${megabytes(maximumBytes, locale)} ميجابايت للملف.`}
      </p>
      <button
        className="mt-4 rounded-xl bg-[var(--itq-color-brand-700)] px-5 py-3 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
        disabled={pending}
        onClick={upload}
        type="button"
      >
        {pending ? (english ? "Uploading…" : "جارٍ الرفع…") : english ? "Upload file" : "رفع الملف"}
      </button>
      {message === undefined ? null : (
        <p
          aria-live="polite"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
            success
              ? "border-emerald-200 bg-emerald-50 text-emerald-950"
              : "border-red-200 bg-red-50 text-red-950"
          }`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
