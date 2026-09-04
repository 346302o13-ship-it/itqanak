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

// Mirrors packages/storage/src/upload-validation.ts's allowlist — that
// module is the authority; this map only saves a round trip when the
// browser's own File.type guess is missing or wrong.
const uploadMimeByExtension: Readonly<Record<string, string>> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
  rtf: "application/rtf",
  csv: "text/csv",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  heif: "image/heif",
  webm: "audio/webm",
  ogg: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  amr: "audio/amr",
  mp4: "video/mp4",
  mov: "video/quicktime",
  "3gp": "video/3gpp",
  zip: "application/zip",
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
        accept=".pdf,.docx,.pptx,.xlsx,.doc,.xls,.ppt,.rtf,.csv,.txt,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif,.webm,.ogg,.mp3,.wav,.m4a,.aac,.amr,.mp4,.mov,.3gp,.zip"
        className="mt-3 block w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 text-sm"
        disabled={pending}
        id="requestAttachment"
        ref={fileInput}
        type="file"
      />
      <p className="mt-2 text-xs leading-6 text-[var(--itq-color-muted)]">
        {english
          ? `Allowed: documents (PDF, Word, PowerPoint, Excel, RTF, CSV, text), images (incl. WebP, GIF, HEIC), voice or video messages, and ZIP archives. Maximum ${megabytes(maximumBytes, locale)} MB per file.`
          : `الأنواع المسموحة: المستندات (PDF وWord وPowerPoint وExcel وRTF وCSV ونص)، والصور (وتشمل WebP وGIF وHEIC)، والرسائل الصوتية أو مقاطع الفيديو، وملفات ZIP المضغوطة. الحد الأقصى لهذا الطلب ${megabytes(maximumBytes, locale)} ميجابايت للملف.`}
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
              ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-900)]"
              : "border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-950)]"
          }`}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}
