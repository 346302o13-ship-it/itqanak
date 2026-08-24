"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { ChatMessage } from "@itqanak/requests";
import type { RequestStatus } from "@itqanak/core";

import { requestStatusLabel } from "@/lib/request-presenters";

import { CheckCheckIcon, CheckIcon, MessageIcon, MicIcon, PaperclipIcon, SendIcon } from "./icons";

interface RequestChatProps {
  readonly csrfToken: string | undefined;
  readonly requestNumber: string;
  readonly requestVersion: number;
  readonly requestStatus: RequestStatus;
  readonly maximumBytes: number;
  readonly messages: readonly ChatMessage[];
  readonly locale?: "ar" | "en";
  readonly mode?: "student" | "admin";
}

interface UploadResult {
  readonly attachment?: { readonly id?: string };
  readonly requestVersion?: number;
  readonly message?: string;
  readonly error?: string;
}

interface AttachmentStatusResult {
  readonly scanStatus?: string;
  readonly mimeType?: string;
  readonly message?: string;
}

const mimeByExtension: Readonly<Record<string, string>> = {
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

function declaredMime(file: File): string {
  const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
  return mimeByExtension[extension] ?? (file.type || "application/octet-stream");
}

function messageKind(mimeType: string): "IMAGE" | "AUDIO" | "FILE" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function useReadReceipt(
  csrfToken: string | undefined,
  requestNumber: string,
  latestIncomingMessageId: string | undefined,
  apiBase: string,
) {
  useEffect(() => {
    if (latestIncomingMessageId === undefined || csrfToken === undefined) return;
    const body = new URLSearchParams({ csrfToken });
    void fetch(`${apiBase}/${encodeURIComponent(requestNumber)}/messages/read`, {
      method: "POST",
      body,
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }, [apiBase, csrfToken, latestIncomingMessageId, requestNumber]);
}

function Receipt({
  status,
  locale,
}: Readonly<{ status: ChatMessage["status"]; locale: "ar" | "en" }>) {
  const english = locale === "en";
  if (status === "SENT") {
    return (
      <span className="inline-flex items-center gap-1" title={english ? "Sent" : "أُرسلت"}>
        <CheckIcon className="size-3.5" /> {english ? "Sent" : "أُرسلت"}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 ${status === "READ" ? "text-sky-600" : ""}`}
      title={status === "READ" ? (english ? "Read" : "قُرئت") : english ? "Delivered" : "وصلت"}
    >
      <CheckCheckIcon className="size-3.5" />{" "}
      {status === "READ" ? (english ? "Read" : "قُرئت") : english ? "Delivered" : "وصلت"}
    </span>
  );
}

function MessageBody({
  message,
  requestNumber,
  locale,
}: Readonly<{ message: ChatMessage; requestNumber: string; locale: "ar" | "en" }>) {
  if (message.attachment !== undefined) {
    const download = `/api/student/requests/${encodeURIComponent(requestNumber)}/attachments/${encodeURIComponent(message.attachment.id)}/download`;
    const preview = `/api/student/requests/${encodeURIComponent(requestNumber)}/attachments/${encodeURIComponent(message.attachment.id)}/preview`;
    const unscanned =
      message.attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
      message.attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT";
    const warning = locale === "en" ? "Not malware-scanned" : "لم يُفحص أمنيًا";
    if (message.contentType === "IMAGE" && !unscanned) {
      return (
        <a className="block overflow-hidden rounded-xl bg-black/5" href={download}>
          <img
            alt={message.attachment.originalFilename}
            className="max-h-72 w-full object-cover"
            loading="lazy"
            src={preview}
          />
        </a>
      );
    }
    if (message.contentType === "AUDIO") {
      return (
        <div className="min-w-52">
          <audio className="w-full" controls preload="none" src={preview}>
            <a href={download}>
              {locale === "en" ? "Download voice message" : "تنزيل الرسالة الصوتية"}
            </a>
          </audio>
          <p className="mt-2 truncate text-xs font-bold">{message.attachment.originalFilename}</p>
          {unscanned ? (
            <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-950">
              {warning}
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="min-w-52">
        <a
          className="flex items-center gap-3 rounded-xl border border-current/15 bg-white/60 p-3 font-bold underline"
          href={download}
        >
          <PaperclipIcon className="size-5 shrink-0" />
          <span className="min-w-0 truncate" dir="auto">
            {message.attachment.originalFilename}
          </span>
        </a>
        {unscanned ? (
          <p className="mt-2 rounded-lg bg-amber-100 px-2 py-1 text-xs font-black text-amber-950">
            {warning}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap leading-7" dir="auto">
      {message.body}
    </p>
  );
}

function systemMessageLabel(message: ChatMessage, locale: "ar" | "en"): string {
  const english = locale === "en";
  const toStatus =
    typeof message.metadata.toStatus === "string" ? message.metadata.toStatus : undefined;
  if (message.body === "REQUEST_STATUS_CHANGED") {
    return toStatus === undefined
      ? english
        ? "The team updated the request status"
        : "حدّثت الإدارة حالة الطلب"
      : english
        ? `The team updated the status to: ${requestStatusLabel(toStatus, locale)}`
        : `حدّثت الإدارة الحالة إلى: ${requestStatusLabel(toStatus, locale)}`;
  }
  if (message.body === "REQUEST_ASSIGNED")
    return english ? "A request manager was assigned" : "تم إسناد الطلب إلى مدير المتابعة";
  if (message.body === "REQUEST_UNASSIGNED")
    return english ? "The request manager was updated" : "تم تحديث مسؤول متابعة الطلب";
  if (message.body === "REQUEST_DETAILS_UPDATED")
    return english ? "The team updated the request details" : "حدّثت الإدارة تفاصيل الطلب";
  if (message.body === "STUDENT_ACTION_COMPLETED") {
    return toStatus === undefined
      ? english
        ? "The student confirmed a request action"
        : "أكد الطالب إجراءً على الطلب"
      : english
        ? `Student action confirmed: ${requestStatusLabel(toStatus, locale)}`
        : `أكد الطالب الإجراء: ${requestStatusLabel(toStatus, locale)}`;
  }
  return message.body ?? (english ? "Request updated" : "تم تحديث الطلب");
}

export function RequestChat({
  csrfToken,
  requestNumber,
  requestVersion,
  requestStatus,
  maximumBytes,
  messages,
  locale = "ar",
  mode = "student",
}: RequestChatProps) {
  const english = locale === "en";
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaRecorder = useRef<MediaRecorder | undefined>(undefined);
  const mediaStream = useRef<MediaStream | undefined>(undefined);
  const recordedChunks = useRef<Blob[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const previousLastMessageId = useRef<string | undefined>(undefined);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [version, setVersion] = useState(requestVersion);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);

  const apiBase = mode === "admin" ? "/api/admin/requests" : "/api/student/requests";
  const latestIncomingMessageId = [...messages]
    .reverse()
    .find((message) =>
      mode === "admin" ? message.senderType === "STUDENT" : message.senderType === "ADMIN",
    )?.id;
  const latestMessageId = messages.at(-1)?.id;
  useReadReceipt(csrfToken, requestNumber, latestIncomingMessageId, apiBase);

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

  async function send(fields: Record<string, string>): Promise<boolean> {
    if (csrfToken === undefined) {
      setNotice(
        english
          ? "The page expired. Refresh it and try again."
          : "انتهت صلاحية الصفحة. حدّث الصفحة وأعد المحاولة.",
      );
      return false;
    }
    const form = new URLSearchParams({
      csrfToken,
      clientMessageId: crypto.randomUUID(),
      ...fields,
    });
    const response = await fetch(`${apiBase}/${encodeURIComponent(requestNumber)}/messages`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    if (!response.ok) {
      const result = (await response.json().catch(() => ({}))) as { readonly message?: string };
      setNotice(
        (english ? undefined : result.message) ??
          (english
            ? "The message could not be sent. Please try again."
            : "تعذر إرسال الرسالة. حاول مجدداً."),
      );
      return false;
    }
    router.refresh();
    return true;
  }

  async function submitText() {
    const normalized = body.trim();
    if (normalized.length === 0 || pending) return;
    setPending(true);
    setNotice(undefined);
    try {
      if (await send({ contentType: "TEXT", body: normalized })) setBody("");
    } finally {
      setPending(false);
    }
  }

  async function transition(toStatus: RequestStatus) {
    if (csrfToken === undefined || pending) return;
    setPending(true);
    setNotice(english ? "Confirming the action…" : "جارٍ اعتماد الإجراء…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        version: String(version),
        toStatus,
      });
      const response = await fetch(
        `/api/student/requests/${encodeURIComponent(requestNumber)}/transition`,
        {
          method: "POST",
          body: form,
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      const result = (await response.json().catch(() => ({}))) as {
        readonly requestVersion?: number;
        readonly message?: string;
      };
      if (!response.ok)
        throw new Error(
          (english ? undefined : result.message) ??
            (english ? "The action could not be confirmed." : "تعذر اعتماد الإجراء."),
        );
      if (typeof result.requestVersion === "number") setVersion(result.requestVersion);
      setNotice(
        english
          ? "The action was confirmed and the request status updated."
          : "تم اعتماد الإجراء وتحديث حالة الطلب.",
      );
      router.refresh();
    } catch (error: unknown) {
      setNotice(
        error instanceof Error
          ? error.message
          : english
            ? "The action could not be confirmed."
            : "تعذر اعتماد الإجراء.",
      );
    } finally {
      setPending(false);
    }
  }

  async function cleanAttachment(attachmentId: string): Promise<AttachmentStatusResult> {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const response = await fetch(
        `/api/student/requests/${encodeURIComponent(requestNumber)}/attachments/${encodeURIComponent(attachmentId)}/status`,
        { credentials: "same-origin", cache: "no-store" },
      );
      const result = (await response.json().catch(() => ({}))) as AttachmentStatusResult;
      if (!response.ok)
        throw new Error(
          (english ? undefined : result.message) ??
            (english ? "The file could not be scanned." : "تعذر فحص الملف."),
        );
      if (
        result.scanStatus === "CLEAN" ||
        result.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
        result.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
      ) {
        return result;
      }
      if (["INFECTED", "REJECTED", "SCAN_ERROR"].includes(result.scanStatus ?? "")) {
        throw new Error(
          english ? "The file did not pass the security scan." : "لم يجتز الملف الفحص الأمني.",
        );
      }
      await wait(1_250);
    }
    throw new Error(
      english
        ? "The file is still being scanned. It will remain under Files and can be sent once scanning is complete."
        : "ما زال الملف قيد الفحص. سيظهر ضمن الملفات ويمكنك إرساله بعد اكتمال الفحص.",
    );
  }

  async function uploadAndSend(file: File) {
    if (pending) return;
    if (file.size < 1 || file.size > maximumBytes) {
      setNotice(
        english
          ? "That file size is not allowed for this request."
          : "حجم الملف غير مسموح لهذا الطلب.",
      );
      return;
    }
    if (csrfToken === undefined) {
      setNotice(
        english
          ? "The page expired. Refresh it and try again."
          : "انتهت صلاحية الصفحة. حدّث الصفحة وأعد المحاولة.",
      );
      return;
    }
    setPending(true);
    setNotice(
      english
        ? "Uploading the file and applying the current security policy…"
        : "جارٍ رفع الملف وتطبيق سياسة الأمان الحالية…",
    );
    try {
      const mime = declaredMime(file);
      const upload = await fetch(
        `/api/student/requests/${encodeURIComponent(requestNumber)}/attachments`,
        {
          method: "POST",
          body: file,
          credentials: "same-origin",
          headers: {
            "Content-Type": mime,
            "X-Itqanak-CSRF-Token": csrfToken,
            "X-Itqanak-Filename": encodeURIComponent(file.name),
            "X-Itqanak-Request-Version": String(version),
          },
        },
      );
      const result = (await upload.json().catch(() => ({}))) as UploadResult;
      if (!upload.ok || result.attachment?.id === undefined) {
        throw new Error(
          (english ? undefined : result.message) ??
            (english ? "The file could not be uploaded." : "تعذر رفع الملف."),
        );
      }
      if (typeof result.requestVersion === "number") setVersion(result.requestVersion);
      const clean = await cleanAttachment(result.attachment.id);
      const unscanned =
        clean.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
        clean.scanStatus === "SCAN_SKIPPED_DEVELOPMENT";
      setNotice(
        unscanned
          ? english
            ? "Scanning is disabled. Sending with an unscanned-file warning…"
            : "الفحص معطّل. جارٍ الإرسال مع تحذير بأن الملف غير مفحوص…"
          : english
            ? "Scan complete. Sending the message…"
            : "تم الفحص. جارٍ إرسال الرسالة…",
      );
      const sent = await send({
        contentType: messageKind(clean.mimeType ?? mime),
        attachmentId: result.attachment.id,
      });
      setNotice(
        sent
          ? unscanned
            ? english
              ? "The file was sent without a malware scan; the warning remains visible."
              : "تم إرسال الملف دون فحص برمجيات ضارة، وسيبقى التحذير ظاهرًا."
            : english
              ? "The file was scanned and sent."
              : "تم فحص الملف وإرساله."
          : english
            ? "The file was uploaded, but the message could not be sent."
            : "تم الرفع لكن تعذر إرسال الرسالة.",
      );
    } catch (error: unknown) {
      setNotice(
        error instanceof Error
          ? error.message
          : english
            ? "The file could not be uploaded and sent."
            : "تعذر رفع الملف وإرساله.",
      );
    } finally {
      if (fileInput.current !== null) fileInput.current.value = "";
      setPending(false);
    }
  }

  async function toggleRecording() {
    if (recording) {
      mediaRecorder.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice(
        english
          ? "Voice recording is not supported in this browser. You can attach an audio file instead."
          : "التسجيل الصوتي غير مدعوم في هذا المتصفح. يمكنك إرفاق ملف صوتي.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaStream.current = stream;
      mediaRecorder.current = recorder;
      recordedChunks.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        setRecording(false);
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(recordedChunks.current, { type: recorder.mimeType || "audio/webm" });
        const extension = recorder.mimeType.includes("ogg") ? "ogg" : "webm";
        void uploadAndSend(
          new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type }),
        );
      });
      recorder.start(500);
      setRecording(true);
      setNotice(
        english
          ? "Recording… Press the microphone again to stop and send."
          : "جارٍ التسجيل… اضغط زر الميكروفون مرة أخرى للإيقاف والإرسال.",
      );
    } catch {
      setNotice(
        english
          ? "Microphone access was not granted. Allow access or attach an audio file."
          : "لم يُسمح باستخدام الميكروفون. امنح الإذن أو أرفق ملفاً صوتياً.",
      );
    }
  }

  return (
    <section
      aria-labelledby="conversation-title"
      className="overflow-hidden rounded-[1.5rem] border border-[var(--itq-color-border)] bg-[#f4f8f7]"
    >
      <header className="flex items-center justify-between gap-4 border-b border-[var(--itq-color-border)] bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-700)]">
            <MessageIcon className="size-5" />
          </span>
          <div>
            <h2 className="font-black" id="conversation-title">
              {english ? "Request conversation" : "محادثة الطلب"}
            </h2>
            <p className="text-xs font-semibold text-[var(--itq-color-muted)]">
              {english ? "Private between you and the ITQANAK team" : "بينك وبين إدارة إتقانك فقط"}
            </p>
          </div>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-800">
          <span className="size-2 rounded-full bg-emerald-500" />{" "}
          {english ? "Secure & private" : "آمنة وخاصة"}
        </span>
      </header>

      <div
        aria-live="polite"
        aria-relevant="additions"
        className="max-h-[38rem] min-h-72 overflow-y-auto px-4 py-6 sm:px-6"
        onScroll={(event) => {
          const element = event.currentTarget;
          nearBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 120;
          if (nearBottomRef.current) setNewMessagesAvailable(false);
        }}
        ref={logRef}
        role="log"
      >
        {messages.length === 0 ? (
          <div className="mx-auto grid max-w-sm place-items-center py-12 text-center">
            <span className="grid size-16 place-items-center rounded-full bg-white text-[var(--itq-color-brand-700)] shadow-sm">
              <MessageIcon className="size-7" />
            </span>
            <p className="mt-4 font-black">
              {english ? "Start your request conversation" : "ابدأ محادثة طلبك"}
            </p>
            <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
              {english
                ? "Send a question or file. Request updates and action buttons will appear here."
                : "أرسل استفسارك أو ملفاتك، وستظهر هنا تحديثات الطلب والأزرار الإجرائية."}
            </p>
          </div>
        ) : (
          <ol className="grid gap-3">
            {messages.map((message) => {
              if (
                message.senderType === "SYSTEM" ||
                message.contentType === "SYSTEM" ||
                message.contentType === "ACTION"
              ) {
                return (
                  <li
                    className="mx-auto max-w-xl rounded-full border border-[var(--itq-color-border)] bg-white/90 px-4 py-2 text-center text-xs font-bold text-[var(--itq-color-muted)]"
                    key={message.id}
                  >
                    <span dir="auto">{systemMessageLabel(message, locale)}</span>
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
                    className={`max-w-[88%] rounded-2xl px-4 py-3 shadow-sm sm:max-w-[72%] ${mine ? "rounded-ee-sm bg-[var(--itq-color-brand-700)] text-white" : "rounded-es-sm border border-[var(--itq-color-border)] bg-white text-[var(--itq-color-ink)]"}`}
                  >
                    {!mine ? (
                      <p className="mb-2 text-[11px] font-black text-[var(--itq-color-brand-700)]">
                        {mode === "admin"
                          ? english
                            ? "Student"
                            : "الطالب"
                          : english
                            ? "ITQANAK team"
                            : "إدارة إتقانك"}
                      </p>
                    ) : null}
                    <MessageBody locale={locale} message={message} requestNumber={requestNumber} />
                    <footer
                      className={`mt-2 flex items-center justify-end gap-2 text-[10px] ${mine ? "text-white/75" : "text-[var(--itq-color-muted)]"}`}
                    >
                      <time dateTime={message.sentAt.toISOString()}>
                        {new Intl.DateTimeFormat(english ? "en-GB" : "ar-SA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(message.sentAt)}
                      </time>
                      {mine ? <Receipt locale={locale} status={message.status} /> : null}
                    </footer>
                  </article>
                </li>
              );
            })}
          </ol>
        )}
        {mode === "student" && requestStatus === "WAITING_FOR_STUDENT" ? (
          <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-4 text-center">
            <p className="font-black text-amber-950">
              {english ? "The team is waiting for information" : "الإدارة تنتظر معلومات منك"}
            </p>
            <p className="mt-1 text-xs leading-6 text-amber-900">
              {english
                ? "Send the requested reply or file, then confirm that your response is complete."
                : "أرسل الرد أو الملف المطلوب، ثم أكد اكتمال ردك."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-xs font-black text-amber-950"
                onClick={() => composerRef.current?.focus()}
                type="button"
              >
                {english ? "Write a reply" : "كتابة الرد"}
              </button>
              <button
                className="rounded-xl bg-amber-900 px-4 py-2 text-xs font-black text-white"
                disabled={pending}
                onClick={() => void transition("SUBMITTED")}
                type="button"
              >
                {english ? "Information sent" : "تم إرسال المعلومات"}
              </button>
            </div>
          </div>
        ) : null}
        {mode === "student" && requestStatus === "QUOTED" ? (
          <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-sky-200 bg-sky-50 p-4 text-center">
            <p className="font-black text-sky-950">
              {english ? "Your request is ready to proceed" : "الطلب جاهز للمتابعة"}
            </p>
            <p className="mt-1 text-xs text-sky-900">
              {english
                ? "Review the conversation, then approve to begin work."
                : "راجع تفاصيل المحادثة ثم وافق لبدء التنفيذ."}
            </p>
            <button
              className="mt-3 rounded-xl bg-sky-900 px-5 py-2.5 text-xs font-black text-white"
              disabled={pending}
              onClick={() => void transition("ACCEPTED")}
              type="button"
            >
              {english ? "Approve and proceed" : "الموافقة على المتابعة"}
            </button>
          </div>
        ) : null}
        {mode === "student" && requestStatus === "DELIVERED" ? (
          <div className="mx-auto mt-5 max-w-xl rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
            <p className="font-black text-emerald-950">
              {english ? "Your request has been delivered" : "تم تسليم مخرجات الطلب"}
            </p>
            <p className="mt-1 text-xs text-emerald-900">
              {english
                ? "Confirm receipt, or request a revision and explain what you need in the conversation."
                : "أكد الاستلام أو اطلب تعديلاً مع توضيح المطلوب في المحادثة."}
            </p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-black text-emerald-950"
                disabled={pending}
                onClick={() => {
                  composerRef.current?.focus();
                  void transition("REVISION_REQUESTED");
                }}
                type="button"
              >
                {english ? "Request revision" : "طلب تعديل"}
              </button>
              <button
                className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-black text-white"
                disabled={pending}
                onClick={() => void transition("COMPLETED")}
                type="button"
              >
                {english ? "Confirm receipt" : "تأكيد الاستلام"}
              </button>
            </div>
          </div>
        ) : null}
        {newMessagesAvailable ? (
          <button
            className="sticky bottom-2 mx-auto mt-4 block rounded-full bg-[var(--itq-color-ink)] px-4 py-2 text-xs font-black text-white shadow-lg"
            onClick={() => {
              nearBottomRef.current = true;
              setNewMessagesAvailable(false);
              endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
            type="button"
          >
            {english ? "New messages" : "رسائل جديدة"}
          </button>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="border-t border-[var(--itq-color-border)] bg-white p-3 sm:p-4">
        {notice === undefined ? null : (
          <p
            aria-live="polite"
            className="mb-3 rounded-xl bg-[var(--itq-color-surface-soft)] px-4 py-2 text-xs font-bold"
            role="status"
          >
            {notice}
          </p>
        )}
        <div className="flex items-end gap-2">
          <input
            accept=".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webm,.ogg,.mp3,.wav"
            className="sr-only"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file !== undefined) void uploadAndSend(file);
            }}
            ref={fileInput}
            type="file"
          />
          <button
            aria-label={english ? "Attach an image or file" : "إرفاق صورة أو ملف"}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-[var(--itq-color-border)] text-[var(--itq-color-muted)] transition hover:bg-[var(--itq-color-brand-50)]"
            disabled={pending}
            onClick={() => fileInput.current?.click()}
            type="button"
          >
            <PaperclipIcon className="size-5" />
          </button>
          <button
            aria-label={
              recording
                ? english
                  ? "Stop and send recording"
                  : "إيقاف التسجيل وإرساله"
                : english
                  ? "Record a voice message"
                  : "تسجيل رسالة صوتية"
            }
            className={`grid size-11 shrink-0 place-items-center rounded-xl border transition ${recording ? "animate-pulse border-red-300 bg-red-50 text-red-700" : "border-[var(--itq-color-border)] text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-brand-50)]"}`}
            disabled={pending}
            onClick={() => void toggleRecording()}
            type="button"
          >
            <MicIcon className="size-5" />
          </button>
          <textarea
            className="max-h-40 min-h-11 flex-1 resize-y rounded-xl border border-[var(--itq-color-border)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)] focus:ring-2 focus:ring-[var(--itq-color-brand-100)]"
            dir="auto"
            maxLength={10_000}
            onChange={(event) => setBody(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submitText();
              }
            }}
            placeholder={english ? "Write your message…" : "اكتب رسالتك…"}
            ref={composerRef}
            rows={1}
            value={body}
          />
          <button
            aria-label={english ? "Send message" : "إرسال الرسالة"}
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-white transition hover:bg-[var(--itq-color-brand-800)] disabled:opacity-50"
            disabled={pending || body.trim().length === 0}
            onClick={() => void submitText()}
            type="button"
          >
            <SendIcon className="size-5 rtl:-scale-x-100" />
          </button>
        </div>
        <p className="mt-2 px-1 text-[10px] font-semibold text-[var(--itq-color-muted)]">
          {english
            ? "Uploads follow the current file-security policy; unscanned files keep a visible warning. Press Enter to send, or Shift+Enter for a new line."
            : "تُطبّق سياسة أمان الملفات الحالية على المرفقات، ويبقى تحذير واضح على غير المفحوص. Enter للإرسال وShift+Enter لسطر جديد."}
        </p>
      </div>
    </section>
  );
}
