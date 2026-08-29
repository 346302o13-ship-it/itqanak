"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import type {
  ServiceQuote,
  ServiceQuoteCurrency,
  UnifiedConversationDetail,
  UnifiedConversationSummary,
  UnifiedConversationAttachment,
  UnifiedMessage,
  UnifiedMessageListResult,
  UnifiedRequestSummary,
} from "@itqanak/requests";
import { getAllowedRequestTransitions, type RequestStatus } from "@itqanak/core";

import {
  decimalAmountToMinor,
  formatQuoteAmount,
  hasPendingQuoteForRequest,
  hydrateUnifiedConversationSummary,
  hydrateUnifiedMessage,
  mergeUnifiedMessages,
  pollingDelay,
  replaceQuoteInMessages,
  type WireUnifiedConversationSummary,
  type WireUnifiedMessage,
} from "@/lib/unified-chat-client";
import { requestStatusLabel } from "@/lib/request-presenters";

import {
  ArrowIcon,
  CheckCheckIcon,
  CheckIcon,
  CloseIcon,
  MessageIcon,
  MicIcon,
  PaperclipIcon,
  RequestsIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  UserIcon,
} from "./icons";
import { RequestStatusChip } from "./request-status-chip";

interface UnifiedChatWorkspaceProps {
  readonly conversation?: UnifiedConversationDetail;
  readonly conversations?: readonly UnifiedConversationSummary[];
  readonly csrfToken: string | undefined;
  readonly initialMessagePage: UnifiedMessageListResult;
  readonly locale?: "ar" | "en";
  readonly maximumBytes: number;
  readonly mode: "student" | "admin";
  readonly search?: string;
  readonly selectedRequestId?: string;
}

interface MessageListWire {
  readonly items?: readonly WireUnifiedMessage[];
  readonly page?: number;
  readonly pageCount?: number;
  readonly incremental?: boolean;
}

/** A text message the client has accepted but the server has not yet confirmed. */
interface OutboxEntry {
  readonly clientMessageId: string;
  readonly body: string;
  readonly requestId?: string;
  readonly status: "sending" | "failed";
}

interface ConversationListWire {
  readonly items?: readonly WireUnifiedConversationSummary[];
}

interface MessageMutationWire {
  readonly message?: WireUnifiedMessage | string;
  readonly quote?: ServiceQuote;
  readonly error?: string;
}

interface AttachmentMutationWire {
  readonly attachment?: UnifiedConversationAttachment;
  readonly error?: string;
  readonly message?: string;
}

interface AttachmentStatusWire {
  readonly attachment?: UnifiedConversationAttachment;
  readonly error?: string;
  readonly message?: string;
}

interface RequestTransitionWire {
  readonly request?: UnifiedRequestSummary;
  readonly error?: string;
  readonly message?: string;
}

interface StudentTransitionWire {
  readonly status?: RequestStatus;
  readonly requestVersion?: number;
  readonly error?: string;
  readonly message?: string;
}

const acceptedExtensions = ".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webm,.ogg,.mp3,.wav";
const quoteEligibleRequestStatuses = new Set<RequestStatus>([
  "SUBMITTED",
  "WAITING_FOR_STUDENT",
  "UNDER_REVIEW",
  "QUOTED",
]);

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

function contentTypeForMime(mimeType: string): "IMAGE" | "AUDIO" | "FILE" {
  if (mimeType.startsWith("image/")) return "IMAGE";
  if (mimeType.startsWith("audio/")) return "AUDIO";
  return "FILE";
}

function pause(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((part) => part.slice(0, 1))
      .join("") || "؟"
  );
}

function formatMessageTime(value: Date, locale: "ar" | "en"): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-SA", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function dateKey(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
}

function formatMessageDate(value: Date, locale: "ar" | "en"): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(value) === dateKey(now)) return locale === "en" ? "Today" : "اليوم";
  if (dateKey(value) === dateKey(yesterday)) return locale === "en" ? "Yesterday" : "أمس";
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "ar-SA", {
    day: "numeric",
    month: "short",
    year: value.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(value);
}

function systemMessageLabel(message: UnifiedMessage, locale: "ar" | "en"): string {
  const english = locale === "en";
  const toStatus =
    typeof message.metadata.toStatus === "string" ? message.metadata.toStatus : undefined;
  const labels: Readonly<Record<string, readonly [string, string]>> = {
    REQUEST_CREATED: ["تم إنشاء الطلب", "Request created"],
    REQUEST_SUBMITTED: ["تم إرسال الطلب إلى الإدارة", "Request submitted to the team"],
    REQUEST_UPDATED: ["تم تحديث تفاصيل الطلب", "Request details updated"],
    REQUEST_DETAILS_UPDATED: ["حدّثت الإدارة تفاصيل الطلب", "The team updated request details"],
    REQUEST_ASSIGNED: ["تم تعيين مسؤول متابعة للطلب", "A request manager was assigned"],
    REQUEST_UNASSIGNED: ["تم تحديث مسؤول متابعة الطلب", "The request manager was updated"],
    REQUEST_CANCELLED: ["تم إلغاء الطلب", "Request cancelled"],
    ATTACHMENT_ADDED: ["تمت إضافة ملف إلى الطلب", "A file was added to the request"],
    ATTACHMENT_REMOVED: ["تمت إزالة ملف من الطلب", "A file was removed from the request"],
    QUOTE_CREATED: ["أرسلت الإدارة عرض سعر جديدًا", "The team sent a new quote"],
    QUOTE_ACCEPTED: ["وافق الطالب على عرض السعر", "The student accepted the quote"],
    QUOTE_REJECTED: ["رفض الطالب عرض السعر", "The student declined the quote"],
  };
  if (message.body === "REQUEST_STATUS_CHANGED" || message.body === "STUDENT_ACTION_COMPLETED") {
    if (toStatus === undefined) return english ? "Request status updated" : "تم تحديث حالة الطلب";
    return english
      ? `Request status: ${requestStatusLabel(toStatus, locale)}`
      : `حالة الطلب: ${requestStatusLabel(toStatus, locale)}`;
  }
  const label = labels[message.body];
  if (label !== undefined) return english ? label[1] : label[0];
  return message.body || (english ? "Conversation updated" : "تم تحديث المحادثة");
}

function Receipt({
  locale,
  status,
}: Readonly<{ locale: "ar" | "en"; status: UnifiedMessage["status"] }>) {
  const english = locale === "en";
  if (status === "SENT") {
    return (
      <span className="inline-flex items-center gap-0.5" title={english ? "Sent" : "أُرسلت"}>
        <CheckIcon className="size-3.5" />
        <span className="sr-only">{english ? "Sent" : "أُرسلت"}</span>
      </span>
    );
  }
  const read = status === "READ";
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${read ? "text-sky-300" : ""}`}
      title={read ? (english ? "Read" : "قُرئت") : english ? "Delivered" : "وصلت"}
    >
      <CheckCheckIcon className="size-3.5" />
      <span className="sr-only">
        {read ? (english ? "Read" : "قُرئت") : english ? "Delivered" : "وصلت"}
      </span>
    </span>
  );
}

function quoteStatusLabel(status: ServiceQuote["status"], locale: "ar" | "en"): string {
  const labels = {
    PENDING: { ar: "بانتظار رد الطالب", en: "Awaiting student response" },
    ACCEPTED: { ar: "تمت الموافقة", en: "Accepted" },
    REJECTED: { ar: "تم الرفض", en: "Declined" },
    EXPIRED: { ar: "انتهت الصلاحية", en: "Expired" },
    WITHDRAWN: { ar: "تم سحب العرض", en: "Withdrawn" },
  } as const;
  return labels[status][locale];
}

function QuoteCard({
  locale,
  mode,
  onRespond,
  onWithdraw,
  pending,
  quote,
}: Readonly<{
  locale: "ar" | "en";
  mode: "student" | "admin";
  onRespond: (quote: ServiceQuote, decision: "ACCEPT" | "REJECT") => void;
  onWithdraw: (quote: ServiceQuote) => void;
  pending: boolean;
  quote: ServiceQuote;
}>) {
  const english = locale === "en";
  const displayStatus =
    quote.status === "PENDING" && quote.expiresAt.getTime() <= Date.now()
      ? "EXPIRED"
      : quote.status;
  const actionable = mode === "student" && displayStatus === "PENDING";
  const withdrawable = mode === "admin" && displayStatus === "PENDING";
  const accepted = displayStatus === "ACCEPTED";
  const rejected = displayStatus === "REJECTED" || displayStatus === "WITHDRAWN";
  return (
    <article className="mx-auto w-full max-w-xl overflow-hidden rounded-[1.35rem] border border-sky-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 bg-sky-950 px-4 py-3 text-white sm:px-5">
        <span className="inline-flex items-center gap-2 text-sm font-black">
          <span className="grid size-8 place-items-center rounded-xl bg-white/10">﷼</span>
          {english ? "Price quote" : "عرض سعر"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
            accepted
              ? "bg-emerald-400/20 text-emerald-100"
              : rejected
                ? "bg-red-400/20 text-red-100"
                : "bg-white/10 text-white"
          }`}
        >
          {quoteStatusLabel(displayStatus, locale)}
        </span>
      </header>
      <div className="p-4 sm:p-5">
        <p className="text-2xl font-black text-sky-950" dir="ltr">
          {formatQuoteAmount(quote.amountMinor, quote.currency, quote.minorUnit, locale)}
        </p>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[var(--itq-color-ink)]">
          <bdi dir="auto">{english ? quote.descriptionEn : quote.descriptionAr}</bdi>
        </p>
        <p className="mt-3 text-xs font-bold text-[var(--itq-color-muted)]">
          {english ? "Valid until" : "صالح حتى"}:{" "}
          <time dateTime={quote.expiresAt.toISOString()}>
            {new Intl.DateTimeFormat(english ? "en-GB" : "ar-SA", {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(quote.expiresAt)}
          </time>
        </p>
        {actionable ? (
          <div className="mt-4 border-t border-sky-100 pt-4">
            <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-950">
              {english
                ? "Accepting creates an unpaid amount due on your account for this quote."
                : "الموافقة تنشئ مستحقًا غير مدفوع في حسابك بقيمة هذا العرض."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-800 transition hover:bg-red-100 disabled:opacity-50"
                disabled={pending}
                onClick={() => onRespond(quote, "REJECT")}
                type="button"
              >
                {english ? "Decline" : "رفض العرض"}
              </button>
              <button
                className="min-h-11 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800 disabled:opacity-50"
                disabled={pending}
                onClick={() => {
                  const confirmed = window.confirm(
                    english
                      ? "Accept this quote and create the unpaid amount due on your account?"
                      : "هل تؤكد الموافقة على العرض وإنشاء المستحق غير المدفوع في حسابك؟",
                  );
                  if (confirmed) onRespond(quote, "ACCEPT");
                }}
                type="button"
              >
                {english ? "Accept quote" : "الموافقة على العرض"}
              </button>
            </div>
          </div>
        ) : null}
        {withdrawable ? (
          <div className="mt-4 border-t border-sky-100 pt-4">
            <p className="mb-3 text-xs font-bold leading-5 text-[var(--itq-color-muted)]">
              {english
                ? "Withdraw this pending quote before sending a corrected replacement."
                : "اسحب العرض المعلّق أولًا إذا أردت إرسال عرض بديل مصحح."}
            </p>
            <button
              className="min-h-11 w-full rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-black text-red-800 transition hover:bg-red-100 disabled:opacity-50"
              disabled={pending}
              onClick={() => {
                const confirmed = window.confirm(
                  english
                    ? "Withdraw this quote? The student will no longer be able to accept it."
                    : "هل تؤكد سحب هذا العرض؟ لن يتمكن الطالب من الموافقة عليه بعد السحب.",
                );
                if (confirmed) onWithdraw(quote);
              }}
              type="button"
            >
              {english ? "Withdraw quote" : "سحب عرض السعر"}
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AttachmentBody({
  apiBase,
  attachment,
  contentType,
  locale,
  messageId,
}: Readonly<{
  apiBase: string;
  attachment: NonNullable<UnifiedMessage["attachment"]>;
  contentType: UnifiedMessage["contentType"];
  locale: "ar" | "en";
  messageId: string;
}>) {
  const english = locale === "en";
  const [unscannedAudioAllowed, setUnscannedAudioAllowed] = useState(false);
  const download = `${apiBase}/messages/${encodeURIComponent(messageId)}/attachment`;
  const preview = `${download}/preview`;
  const unscanned =
    attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
    attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT";
  const warning =
    attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
      ? english
        ? "This development file was not malware-scanned. Open it only if you trust the sender."
        : "لم يُفحص هذا الملف في بيئة التطوير. افتحه فقط إذا كنت تثق بالمرسل."
      : english
        ? "Malware scanning was disabled when this file was uploaded. Open it only if you trust the sender."
        : "كان فحص البرمجيات الضارة معطّلًا عند رفع هذا الملف. افتحه فقط إذا كنت تثق بالمرسل.";

  return (
    <div className="min-w-0">
      {contentType === "IMAGE" && !unscanned ? (
        <a className="block overflow-hidden rounded-xl bg-black/5" href={download}>
          <img
            alt={attachment.originalFilename}
            className="max-h-80 w-full object-cover"
            loading="lazy"
            src={preview}
          />
        </a>
      ) : contentType === "AUDIO" && (!unscanned || unscannedAudioAllowed) ? (
        <div className="min-w-56 max-w-full">
          <audio
            className="w-full"
            controls
            preload={unscanned ? "none" : "metadata"}
            src={preview}
          >
            <a href={download}>{english ? "Download voice message" : "تنزيل الرسالة الصوتية"}</a>
          </audio>
        </div>
      ) : contentType === "AUDIO" ? (
        <button
          className="min-h-12 w-full rounded-xl border border-amber-300 bg-amber-50 px-4 text-sm font-black text-amber-950"
          onClick={() => setUnscannedAudioAllowed(true)}
          type="button"
        >
          {english ? "Play this unscanned audio" : "تشغيل هذا الصوت غير المفحوص"}
        </button>
      ) : (
        <a
          className="flex min-h-14 items-center gap-3 rounded-xl border border-current/15 bg-white/70 p-3 font-black text-[var(--itq-color-ink)] no-underline"
          href={download}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-700)]">
            <PaperclipIcon className="size-5" />
          </span>
          <span className="min-w-0">
            <bdi className="block truncate text-sm" dir="auto">
              {attachment.originalFilename}
            </bdi>
            <span className="mt-0.5 block text-[10px] text-[var(--itq-color-muted)]">
              {new Intl.NumberFormat(english ? "en" : "ar-SA", {
                maximumFractionDigits: 1,
              }).format(attachment.sizeBytes / 1_048_576)}{" "}
              {english ? "MB · Download" : "م.ب · تنزيل"}
            </span>
          </span>
        </a>
      )}
      {contentType === "AUDIO" ? (
        <a className="mt-2 block truncate text-xs font-black underline" href={download}>
          <bdi dir="auto">{attachment.originalFilename}</bdi>
        </a>
      ) : null}
      {unscanned ? (
        <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold leading-5 text-amber-950">
          {warning}
        </p>
      ) : null}
    </div>
  );
}

function ConversationList({
  conversations,
  locale,
  onClose,
  search,
  selectedId,
}: Readonly<{
  conversations: readonly UnifiedConversationSummary[];
  locale: "ar" | "en";
  onClose?: () => void;
  search?: string;
  selectedId?: string;
}>) {
  const english = locale === "en";
  const prefix = `/${locale}/admin/support`;
  return (
    <>
      <div className="border-b border-[var(--itq-color-border)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-lg font-black">{english ? "Conversations" : "المحادثات"}</p>
            <p className="text-xs font-bold text-[var(--itq-color-muted)]">
              {english ? `${conversations.length} students` : `${conversations.length} طالبًا`}
            </p>
          </div>
          {onClose === undefined ? null : (
            <button
              aria-label={english ? "Close conversations" : "إغلاق قائمة المحادثات"}
              className="grid size-10 place-items-center rounded-2xl bg-white text-[var(--itq-color-muted)] shadow-sm lg:hidden"
              onClick={onClose}
              type="button"
            >
              <CloseIcon className="size-5" />
            </button>
          )}
          <span
            className={`${onClose === undefined ? "grid" : "hidden lg:grid"} size-10 place-items-center rounded-2xl bg-[var(--itq-color-brand-700)] text-white`}
          >
            <MessageIcon className="size-5" />
          </span>
        </div>
        <form action={prefix} className="relative mt-4" method="get">
          <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--itq-color-muted)]" />
          <input
            aria-label={english ? "Search students" : "البحث عن طالب"}
            className="h-11 w-full rounded-xl border border-[var(--itq-color-border)] bg-white ps-10 pe-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
            defaultValue={search}
            maxLength={100}
            name="q"
            placeholder={english ? "Name, mobile or email" : "الاسم أو الجوال أو البريد"}
          />
        </form>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2" role="list">
        {conversations.length === 0 ? (
          <div className="grid min-h-64 place-items-center px-6 text-center text-sm text-[var(--itq-color-muted)]">
            <div>
              <UserIcon className="mx-auto size-9" />
              <p className="mt-3 font-black">
                {english ? "No student conversations found" : "لا توجد محادثات طلاب"}
              </p>
            </div>
          </div>
        ) : (
          conversations.map((item) => {
            const active = item.id === selectedId;
            const href = `${prefix}?student=${encodeURIComponent(item.studentUserId)}${
              search === undefined ? "" : `&q=${encodeURIComponent(search)}`
            }`;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`mb-1.5 flex gap-3 rounded-2xl border p-3 no-underline transition ${
                  active
                    ? "border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)]"
                    : "border-transparent hover:bg-white"
                }`}
                href={href}
                key={item.id}
                role="listitem"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[#123640] text-sm font-black text-white">
                  {initials(item.studentDisplayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <bdi className="truncate text-sm font-black" dir="auto">
                      {item.studentDisplayName}
                    </bdi>
                    {item.lastMessageAt === undefined ? null : (
                      <time
                        className="shrink-0 text-[10px] font-bold text-[var(--itq-color-muted)]"
                        dateTime={item.lastMessageAt.toISOString()}
                      >
                        {formatMessageTime(item.lastMessageAt, locale)}
                      </time>
                    )}
                  </span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <bdi className="truncate text-xs text-[var(--itq-color-muted)]" dir="auto">
                      {item.lastMessagePreview ??
                        (english ? "No messages yet" : "لا توجد رسائل بعد")}
                    </bdi>
                    {item.unreadCount > 0 ? (
                      <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white">
                        {item.unreadCount > 99 ? "99+" : item.unreadCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 text-[10px] font-semibold text-[var(--itq-color-muted)]">
                    {item.studentPhoneE164 === undefined ? null : (
                      <bdi dir="ltr">{item.studentPhoneE164}</bdi>
                    )}
                    {item.studentEmail === undefined ? null : (
                      <bdi className="truncate" dir="ltr">
                        {item.studentEmail}
                      </bdi>
                    )}
                  </span>
                </span>
              </Link>
            );
          })
        )}
      </div>
    </>
  );
}

export function UnifiedChatWorkspace({
  conversation,
  conversations = [],
  csrfToken,
  initialMessagePage,
  locale = "ar",
  maximumBytes,
  mode,
  search,
  selectedRequestId,
}: UnifiedChatWorkspaceProps) {
  const english = locale === "en";
  const fileInput = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const contactsTriggerRef = useRef<HTMLButtonElement>(null);
  const contactsPanelRef = useRef<HTMLElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const detailsPanelRef = useRef<HTMLElement>(null);
  const contactsPanelId = useId();
  const detailsPanelId = useId();
  const nearBottom = useRef(true);
  const previousLastMessageId = useRef<string | undefined>(initialMessagePage.items.at(-1)?.id);
  // Newest message id the client already holds; the poller sends it as `afterId`
  // so a steady-state poll fetches only the delta.
  const latestMessageIdRef = useRef<string | undefined>(initialMessagePage.items.at(-1)?.id);
  const mediaRecorder = useRef<MediaRecorder | undefined>(undefined);
  const mediaStream = useRef<MediaStream | undefined>(undefined);
  const recordedChunks = useRef<Blob[]>([]);
  const discardRecordingOnStop = useRef(false);
  const [messages, setMessages] = useState<UnifiedMessage[]>([...initialMessagePage.items]);
  const [contactItems, setContactItems] = useState<UnifiedConversationSummary[]>([
    ...conversations,
  ]);
  const [requests, setRequests] = useState<UnifiedRequestSummary[]>([
    ...(conversation?.requests ?? []),
  ]);
  const [loadedPage, setLoadedPage] = useState(initialMessagePage.page);
  const [pageCount, setPageCount] = useState(initialMessagePage.pageCount ?? 1);
  const [linkedRequestId, setLinkedRequestId] = useState(selectedRequestId);
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [outbox, setOutbox] = useState<readonly OutboxEntry[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingStarting, setRecordingStarting] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [newMessagesAvailable, setNewMessagesAvailable] = useState(false);
  const [contactsOpen, setContactsOpen] = useState(conversation === undefined);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const closeContacts = useCallback((restoreFocus = true): void => {
    setContactsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => contactsTriggerRef.current?.focus());
  }, []);
  const closeDetails = useCallback((restoreFocus = true): void => {
    setDetailsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }, []);

  const selectedRequest = requests.find((request) => request.id === linkedRequestId);
  const selectedRequestHasPendingQuote =
    selectedRequest !== undefined && hasPendingQuoteForRequest(messages, selectedRequest.id);
  const activeRequestCount = requests.filter(
    (request) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status),
  ).length;
  const interactionLocked = pending || recording || recordingStarting;
  const apiBase =
    mode === "student"
      ? "/api/student/conversation"
      : conversation === undefined
        ? undefined
        : `/api/admin/conversations/${encodeURIComponent(conversation.studentUserId)}`;

  useEffect(() => {
    setMessages([...initialMessagePage.items]);
    setOutbox([]);
    setLoadedPage(initialMessagePage.page);
    setPageCount(initialMessagePage.pageCount ?? 1);
    setRequests([...(conversation?.requests ?? [])]);
    setLinkedRequestId(selectedRequestId);
    setContactsOpen(conversation === undefined);
    setDetailsOpen(false);
    previousLastMessageId.current = initialMessagePage.items.at(-1)?.id;
    latestMessageIdRef.current = initialMessagePage.items.at(-1)?.id;
  }, [conversation, initialMessagePage, selectedRequestId]);

  useEffect(() => {
    setContactItems([...conversations]);
  }, [conversations]);

  useEffect(() => {
    if (conversation === undefined || (!contactsOpen && !detailsOpen)) return;
    const mobileDrawer = window.matchMedia(
      detailsOpen ? "(max-width: 1279px)" : "(max-width: 1023px)",
    );
    if (!mobileDrawer.matches) return;
    const panel = detailsOpen ? detailsPanelRef.current : contactsPanelRef.current;
    const frame = window.requestAnimationFrame(() => panel?.focus());
    const handleDrawerKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (detailsOpen) closeDetails();
        else closeContacts();
        return;
      }
      if (event.key !== "Tab" || panel === null) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (document.activeElement === panel) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", handleDrawerKeys);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleDrawerKeys);
    };
  }, [closeContacts, closeDetails, contactsOpen, conversation, detailsOpen]);

  useEffect(() => {
    const requestUpdates = new Map<string, UnifiedRequestSummary>();
    for (const message of messages) {
      if (message.request !== undefined) requestUpdates.set(message.request.id, message.request);
    }
    if (requestUpdates.size === 0) return;
    setRequests((current) => {
      const byId = new Map(current.map((request) => [request.id, request]));
      for (const [requestId, request] of requestUpdates) byId.set(requestId, request);
      return [...byId.values()].sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      );
    });
  }, [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [conversation?.id]);

  // Drop optimistic entries once the real message (matched by clientMessageId)
  // has arrived, whether from our own POST response or a later poll.
  useEffect(() => {
    setOutbox((current) => {
      if (current.length === 0) return current;
      const known = new Set(
        messages.map((message) => message.clientMessageId).filter((id): id is string => id !== undefined),
      );
      const next = current.filter((entry) => !known.has(entry.clientMessageId));
      return next.length === current.length ? current : next;
    });
  }, [messages]);

  const latestMessageId = messages.at(-1)?.id;
  useEffect(() => {
    latestMessageIdRef.current = latestMessageId;
    if (latestMessageId === undefined) return;
    const previous = previousLastMessageId.current;
    previousLastMessageId.current = latestMessageId;
    if (previous === undefined || previous === latestMessageId) return;
    if (nearBottom.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setNewMessagesAvailable(false);
    } else {
      setNewMessagesAvailable(true);
    }
  }, [latestMessageId]);

  const latestIncomingId = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) =>
          mode === "admin"
            ? message.senderType === "STUDENT" || message.senderType === "SYSTEM"
            : message.senderType === "ADMIN" || message.senderType === "SYSTEM",
        )?.id,
    [messages, mode],
  );

  useEffect(() => {
    if (apiBase === undefined || csrfToken === undefined || latestIncomingId === undefined) return;
    const form = new URLSearchParams({
      csrfToken,
      ...(conversation === undefined ? {} : { conversationId: conversation.id }),
    });
    void (async () => {
      const response = await fetch(`${apiBase}/messages/read`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => undefined);
      if (response?.ok !== true || conversation === undefined) return;
      setContactItems((current) =>
        current.map((item) => (item.id === conversation.id ? { ...item, unreadCount: 0 } : item)),
      );
    })();
  }, [apiBase, conversation, csrfToken, latestIncomingId]);

  const contactItemsRef = useRef(contactItems);
  useEffect(() => {
    contactItemsRef.current = contactItems;
  }, [contactItems]);

  useEffect(() => {
    if (mode !== "admin") return;
    let cancelled = false;
    let failedAttempts = 0;
    let timeout: number | undefined;
    let inFlight = false;
    let controller: AbortController | undefined;
    const trimmedSearch = search?.trim() ?? "";
    const searching = trimmedSearch.length > 0;

    const schedule = (delay?: number) => {
      if (cancelled) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => void poll(),
        delay ??
          (document.visibilityState === "visible"
            ? Math.max(8_000, pollingDelay(failedAttempts, true))
            : 30_000),
      );
    };
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const query = new URLSearchParams();
        if (searching) {
          query.set("q", trimmedSearch);
        } else {
          // Only ask for conversations touched since the newest activity we
          // already hold. A quiet inbox returns zero rows.
          const newest = contactItemsRef.current.reduce(
            (max, item) => Math.max(max, item.lastMessageAt?.getTime() ?? 0),
            0,
          );
          if (newest > 0) query.set("updatedAfter", new Date(newest).toISOString());
        }
        const response = await fetch(`/api/admin/conversations/updates?${query.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("conversation_poll_failed");
        const result = (await response.json()) as ConversationListWire;
        if (!cancelled && Array.isArray(result.items)) {
          const delta = result.items.map(hydrateUnifiedConversationSummary);
          if (searching) {
            setContactItems(
              conversation === undefined || delta.some((item) => item.id === conversation.id)
                ? delta
                : [conversation, ...delta],
            );
          } else if (delta.length > 0) {
            setContactItems((current) => {
              const byId = new Map(current.map((item) => [item.id, item]));
              for (const item of delta) byId.set(item.id, item);
              return [...byId.values()].sort(
                (left, right) =>
                  (right.lastMessageAt?.getTime() ?? 0) - (left.lastMessageAt?.getTime() ?? 0) ||
                  right.createdAt.getTime() - left.createdAt.getTime(),
              );
            });
          }
        }
        failedAttempts = 0;
      } catch {
        if (!cancelled) failedAttempts += 1;
      } finally {
        inFlight = false;
        controller = undefined;
        schedule();
      }
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      schedule(250);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    schedule();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [conversation, mode, search]);

  useEffect(() => {
    if (apiBase === undefined) return;
    let cancelled = false;
    let failedAttempts = 0;
    let timeout: number | undefined;
    let inFlight = false;
    let controller: AbortController | undefined;

    const schedule = (delay?: number) => {
      if (cancelled) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(
        () => void poll(),
        delay ?? pollingDelay(failedAttempts, document.visibilityState === "visible"),
      );
    };
    const poll = async () => {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      inFlight = true;
      controller = new AbortController();
      try {
        const messageQuery = new URLSearchParams();
        if (conversation !== undefined) messageQuery.set("conversationId", conversation.id);
        const afterId = latestMessageIdRef.current;
        if (afterId === undefined) {
          messageQuery.set("page", "1");
          messageQuery.set("pageSize", "100");
        } else {
          messageQuery.set("afterId", afterId);
        }
        const response = await fetch(`${apiBase}/messages?${messageQuery.toString()}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("poll_failed");
        const result = (await response.json()) as MessageListWire;
        if (!cancelled && Array.isArray(result.items)) {
          if (result.items.length > 0) {
            setMessages((current) => mergeUnifiedMessages(current, result.items ?? []));
          }
          if (result.incremental !== true && typeof result.pageCount === "number") {
            setPageCount(result.pageCount);
          }
        }
        failedAttempts = 0;
      } catch {
        if (!cancelled) failedAttempts += 1;
      } finally {
        inFlight = false;
        controller = undefined;
        schedule();
      }
    };
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      schedule(250);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    schedule();
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [apiBase, conversation]);

  useEffect(
    () => () => {
      discardRecordingOnStop.current = true;
      if (mediaRecorder.current?.state === "recording") mediaRecorder.current.stop();
      mediaStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  async function loadOlder() {
    if (apiBase === undefined || loadingOlder || loadedPage >= pageCount) return;
    setLoadingOlder(true);
    setNotice(undefined);
    const container = logRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    try {
      const nextPage = loadedPage + 1;
      const messageQuery = new URLSearchParams({
        page: String(nextPage),
        pageSize: "100",
      });
      if (conversation !== undefined) messageQuery.set("conversationId", conversation.id);
      const response = await fetch(`${apiBase}/messages?${messageQuery.toString()}`, {
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error();
      const result = (await response.json()) as MessageListWire;
      setMessages((current) => mergeUnifiedMessages(current, result.items ?? []));
      setLoadedPage(typeof result.page === "number" ? result.page : nextPage);
      if (typeof result.pageCount === "number") setPageCount(result.pageCount);
      window.requestAnimationFrame(() => {
        if (container !== null) container.scrollTop += container.scrollHeight - previousHeight;
      });
    } catch {
      setNotice(english ? "Older messages could not be loaded." : "تعذر تحميل الرسائل الأقدم.");
    } finally {
      setLoadingOlder(false);
    }
  }

  async function sendMessage(fields: Readonly<Record<string, string>>): Promise<boolean> {
    if (apiBase === undefined || csrfToken === undefined) {
      setNotice(
        english
          ? "This page expired. Refresh it and try again."
          : "انتهت صلاحية الصفحة. حدّثها ثم أعد المحاولة.",
      );
      return false;
    }
    const form = new URLSearchParams({
      csrfToken,
      clientMessageId: crypto.randomUUID(),
      ...fields,
    });
    const response = await fetch(`${apiBase}/messages`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
    if (!response.ok || result.message === undefined || typeof result.message === "string") {
      setNotice(
        response.status === 429
          ? english
            ? "Too many messages were sent. Wait a moment and try again."
            : "تم إرسال رسائل كثيرة. انتظر قليلًا ثم حاول مجددًا."
          : !english && typeof result.message === "string"
            ? result.message
            : english
              ? "The message could not be sent."
              : "تعذر إرسال الرسالة.",
      );
      return false;
    }
    const sentMessage = result.message;
    setMessages((current) => mergeUnifiedMessages(current, [sentMessage]));
    return true;
  }

  async function deliverText(entry: OutboxEntry): Promise<void> {
    if (apiBase === undefined || csrfToken === undefined) {
      setNotice(
        english
          ? "This page expired. Refresh it and try again."
          : "انتهت صلاحية الصفحة. حدّثها ثم أعد المحاولة.",
      );
      return;
    }
    setOutbox((current) =>
      current.map((item) =>
        item.clientMessageId === entry.clientMessageId ? { ...item, status: "sending" } : item,
      ),
    );
    const markFailed = () =>
      setOutbox((current) =>
        current.map((item) =>
          item.clientMessageId === entry.clientMessageId ? { ...item, status: "failed" } : item,
        ),
      );
    const form = new URLSearchParams({
      csrfToken,
      clientMessageId: entry.clientMessageId,
      contentType: "TEXT",
      body: entry.body,
      ...(entry.requestId === undefined ? {} : { requestId: entry.requestId }),
    });
    try {
      const response = await fetch(`${apiBase}/messages`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (!response.ok || result.message === undefined || typeof result.message === "string") {
        if (response.status === 429) {
          setNotice(
            english
              ? "Too many messages were sent. Wait a moment and try again."
              : "تم إرسال رسائل كثيرة. انتظر قليلًا ثم حاول مجددًا.",
          );
        }
        markFailed();
        return;
      }
      // Retrying a send that actually committed replays the same durable message
      // here (matched server-side by clientMessageId), so no duplicate is created.
      const confirmed = result.message;
      setMessages((current) => mergeUnifiedMessages(current, [confirmed]));
      setOutbox((current) =>
        current.filter((item) => item.clientMessageId !== entry.clientMessageId),
      );
    } catch {
      markFailed();
    }
  }

  function submitText() {
    const normalized = body.trim();
    if (normalized.length === 0) return;
    const entry: OutboxEntry = {
      clientMessageId: crypto.randomUUID(),
      body: normalized,
      ...(linkedRequestId === undefined ? {} : { requestId: linkedRequestId }),
      status: "sending",
    };
    setOutbox((current) => [...current, entry]);
    setBody("");
    setNotice(undefined);
    nearBottom.current = true;
    window.requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
    );
    void deliverText(entry);
  }

  async function waitForAttachment(attachment: UnifiedConversationAttachment) {
    if (apiBase === undefined) throw new Error("missing_api");
    if (
      attachment.scanStatus === "CLEAN" ||
      attachment.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
      attachment.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
    ) {
      return {
        scanStatus: attachment.scanStatus,
        mimeType: attachment.detectedMimeType ?? attachment.declaredMimeType,
      };
    }
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const response = await fetch(
        `${apiBase}/attachments/${encodeURIComponent(attachment.id)}/status`,
        { cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" } },
      );
      const result = (await response.json().catch(() => ({}))) as AttachmentStatusWire;
      if (!response.ok) throw new Error(result.message ?? "attachment_status_failed");
      const current = result.attachment;
      if (
        current?.scanStatus === "CLEAN" ||
        current?.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
        current?.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
      ) {
        return {
          scanStatus: current.scanStatus,
          mimeType: current.detectedMimeType ?? current.declaredMimeType,
        };
      }
      if (["INFECTED", "REJECTED", "SCAN_ERROR"].includes(current?.scanStatus ?? "")) {
        throw new Error(
          english ? "The file did not pass the security policy." : "لم يجتز الملف سياسة الأمان.",
        );
      }
      await pause(1_500);
    }
    throw new Error(
      english
        ? "The security scan is still running. Try sending the file again after it finishes."
        : "ما زال الفحص الأمني جاريًا. حاول إرسال الملف بعد اكتماله.",
    );
  }

  async function uploadAndSend(file: File, source: "picker" | "recording" = "picker") {
    if (
      apiBase === undefined ||
      pending ||
      (source === "picker" && (recording || recordingStarting))
    ) {
      return;
    }
    if (file.size < 1 || file.size > maximumBytes) {
      setNotice(
        english
          ? `The maximum file size is ${Math.floor(maximumBytes / 1_048_576)} MB.`
          : `الحد الأعلى لحجم الملف ${Math.floor(maximumBytes / 1_048_576)} م.ب.`,
      );
      return;
    }
    if (csrfToken === undefined) {
      setNotice(english ? "Refresh the page before uploading." : "حدّث الصفحة قبل رفع الملف.");
      return;
    }
    setPending(true);
    setNotice(english ? "Uploading securely…" : "جارٍ الرفع بشكل آمن…");
    try {
      const upload = await fetch(`${apiBase}/attachments`, {
        method: "POST",
        body: file,
        credentials: "same-origin",
        headers: {
          "Content-Type": declaredMime(file),
          "X-Itqanak-CSRF-Token": csrfToken,
          "X-Itqanak-Filename": encodeURIComponent(file.name),
          ...(linkedRequestId === undefined
            ? {}
            : { "X-Itqanak-Linked-Request-ID": linkedRequestId }),
        },
      });
      const result = (await upload.json().catch(() => ({}))) as AttachmentMutationWire;
      if (!upload.ok || result.attachment === undefined) {
        throw new Error(
          result.message ?? (english ? "The file could not be uploaded." : "تعذر رفع الملف."),
        );
      }
      setNotice(
        english
          ? "Applying the current file security policy…"
          : "جارٍ تطبيق سياسة أمان الملفات الحالية…",
      );
      const ready = await waitForAttachment(result.attachment);
      const sent = await sendMessage({
        contentType: contentTypeForMime(ready.mimeType),
        attachmentId: result.attachment.id,
        ...(linkedRequestId === undefined ? {} : { requestId: linkedRequestId }),
      });
      if (sent) {
        setNotice(
          ready.scanStatus === "SCAN_SKIPPED_BY_ADMIN" ||
            ready.scanStatus === "SCAN_SKIPPED_DEVELOPMENT"
            ? english
              ? "Sent without a malware scan. A warning remains visible on the file."
              : "تم الإرسال دون فحص برمجيات ضارة، وسيبقى التحذير ظاهرًا على الملف."
            : english
              ? "File sent."
              : "تم إرسال الملف.",
        );
      }
    } catch (error: unknown) {
      setNotice(
        error instanceof Error && !error.message.endsWith("_failed")
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
      const recorder = mediaRecorder.current;
      if (recorder === undefined || recorder.state === "inactive") return;
      discardRecordingOnStop.current = false;
      recorder.stop();
      return;
    }
    if (pending || recordingStarting) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setNotice(
        english
          ? "Voice recording is unavailable in this browser. Attach an audio file instead."
          : "التسجيل الصوتي غير متاح في هذا المتصفح. أرفق ملفًا صوتيًا بدلًا منه.",
      );
      return;
    }
    setRecordingStarting(true);
    setNotice(english ? "Requesting microphone access…" : "جارٍ طلب إذن الميكروفون…");
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const activeStream = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      if (preferredType === undefined) {
        activeStream.getTracks().forEach((track) => track.stop());
        setNotice(
          english
            ? "This browser cannot record a supported voice format. Attach an MP3, WAV, OGG or WebM audio file instead."
            : "لا يستطيع هذا المتصفح التسجيل بصيغة صوت مدعومة. أرفق ملف MP3 أو WAV أو OGG أو WebM بدلًا منه.",
        );
        return;
      }
      const recorder = new MediaRecorder(activeStream, { mimeType: preferredType });
      mediaStream.current = activeStream;
      mediaRecorder.current = recorder;
      recordedChunks.current = [];
      discardRecordingOnStop.current = false;
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) recordedChunks.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        activeStream.getTracks().forEach((track) => track.stop());
        mediaStream.current = undefined;
        mediaRecorder.current = undefined;
        setRecording(false);
        if (discardRecordingOnStop.current) {
          recordedChunks.current = [];
          return;
        }
        const mimeType = recorder.mimeType.split(";")[0] || "audio/webm";
        const extension = mimeType === "audio/ogg" ? "ogg" : "webm";
        const blob = new Blob(recordedChunks.current, { type: mimeType });
        recordedChunks.current = [];
        if (blob.size > 0) {
          void uploadAndSend(
            new File([blob], `voice-${Date.now()}.${extension}`, { type: mimeType }),
            "recording",
          );
        }
      });
      recorder.start(500);
      setRecording(true);
      setNotice(
        english
          ? "Recording… Press the microphone again to stop and send."
          : "جارٍ التسجيل… اضغط الميكروفون مرة أخرى للإيقاف والإرسال.",
      );
    } catch {
      setNotice(
        english ? "Microphone permission was not granted." : "لم يُمنح إذن استخدام الميكروفون.",
      );
      stream?.getTracks().forEach((track) => track.stop());
      mediaStream.current = undefined;
      mediaRecorder.current = undefined;
      recordedChunks.current = [];
    } finally {
      setRecordingStarting(false);
    }
  }

  async function respondToQuote(quote: ServiceQuote, decision: "ACCEPT" | "REJECT") {
    if (csrfToken === undefined || interactionLocked) return;
    setPending(true);
    setNotice(english ? "Saving your response…" : "جارٍ حفظ ردك…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        expectedVersion: String(quote.version),
        decision,
        clientActionId: crypto.randomUUID(),
      });
      const response = await fetch(`/api/student/quotes/${encodeURIComponent(quote.id)}/respond`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (
        !response.ok ||
        result.quote === undefined ||
        result.message === undefined ||
        typeof result.message === "string"
      )
        throw new Error();
      const responseMessage = result.message;
      const responseQuote = result.quote;
      const hydratedQuote = {
        ...responseQuote,
        createdAt: new Date(responseQuote.createdAt),
        expiresAt: new Date(responseQuote.expiresAt),
        ...(responseQuote.respondedAt === undefined
          ? {}
          : { respondedAt: new Date(responseQuote.respondedAt) }),
        updatedAt: new Date(responseQuote.updatedAt),
      };
      setMessages((current) =>
        mergeUnifiedMessages(replaceQuoteInMessages(current, hydratedQuote), [responseMessage]),
      );
      setNotice(
        decision === "ACCEPT"
          ? english
            ? "Quote accepted. The team has been notified."
            : "تمت الموافقة على العرض وإبلاغ الإدارة."
          : english
            ? "Quote declined. The team has been notified."
            : "تم رفض العرض وإبلاغ الإدارة.",
      );
    } catch {
      setNotice(english ? "Your response could not be saved." : "تعذر حفظ ردك على العرض.");
    } finally {
      setPending(false);
    }
  }

  async function createQuote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (csrfToken === undefined || interactionLocked || selectedRequest === undefined) return;
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const currencyValue = fields.get("currency");
    const currency: ServiceQuoteCurrency =
      currencyValue === "AED" || currencyValue === "KWD" ? currencyValue : "SAR";
    const amountMinor = decimalAmountToMinor(String(fields.get("amount") ?? ""), currency);
    if (amountMinor === undefined) {
      setNotice(english ? "Enter a valid positive quote amount." : "أدخل مبلغ عرض صحيحًا وموجبًا.");
      return;
    }
    setPending(true);
    setNotice(english ? "Sending the quote…" : "جارٍ إرسال عرض السعر…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        requestId: selectedRequest.id,
        expectedRequestVersion: String(selectedRequest.version),
        amountMinor: String(amountMinor),
        currency,
        descriptionAr: String(fields.get("descriptionAr") ?? ""),
        descriptionEn: String(fields.get("descriptionEn") ?? ""),
        expiresAt: new Date(String(fields.get("expiresAt") ?? "")).toISOString(),
        clientQuoteId: crypto.randomUUID(),
      });
      const response = await fetch("/api/admin/quotes", {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (!response.ok || result.message === undefined || typeof result.message === "string") {
        throw new Error();
      }
      const hydrated = hydrateUnifiedMessage(result.message);
      setMessages((current) => mergeUnifiedMessages(current, [hydrated]));
      if (hydrated.request !== undefined) {
        setRequests((current) =>
          current.map((request) =>
            request.id === hydrated.request?.id ? hydrated.request : request,
          ),
        );
      }
      formElement.reset();
      setNotice(english ? "Quote sent to the student." : "تم إرسال عرض السعر إلى الطالب.");
    } catch {
      setNotice(english ? "The quote could not be sent." : "تعذر إرسال عرض السعر.");
    } finally {
      setPending(false);
    }
  }

  async function withdrawQuote(quote: ServiceQuote) {
    if (csrfToken === undefined || interactionLocked) return;
    const request = requests.find((item) => item.id === quote.requestId);
    if (request === undefined) {
      setNotice(
        english
          ? "Refresh the conversation before withdrawing this quote."
          : "حدّث المحادثة قبل سحب عرض السعر.",
      );
      return;
    }
    setPending(true);
    setNotice(english ? "Withdrawing the quote…" : "جارٍ سحب عرض السعر…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        expectedVersion: String(quote.version),
        expectedRequestVersion: String(request.version),
        clientActionId: crypto.randomUUID(),
      });
      const response = await fetch(`/api/admin/quotes/${encodeURIComponent(quote.id)}/withdraw`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (!response.ok || result.message === undefined || typeof result.message === "string") {
        throw new Error();
      }
      const hydrated = hydrateUnifiedMessage(result.message);
      const withdrawnQuote = hydrated.quote;
      if (withdrawnQuote === undefined) throw new Error();
      setMessages((current) =>
        mergeUnifiedMessages(replaceQuoteInMessages(current, withdrawnQuote), [hydrated]),
      );
      if (hydrated.request !== undefined) {
        setRequests((current) =>
          current.map((item) => (item.id === hydrated.request?.id ? hydrated.request : item)),
        );
      }
      setNotice(
        english
          ? "Quote withdrawn. You can now send a corrected replacement."
          : "تم سحب العرض، ويمكنك الآن إرسال عرض بديل مصحح.",
      );
    } catch {
      setNotice(
        english
          ? "The quote could not be withdrawn. Refresh and try again."
          : "تعذر سحب عرض السعر. حدّث المحادثة ثم حاول مجددًا.",
      );
    } finally {
      setPending(false);
    }
  }

  async function transitionAdminRequest(
    event: React.FormEvent<HTMLFormElement>,
    request: UnifiedRequestSummary,
  ) {
    event.preventDefault();
    if (csrfToken === undefined || interactionLocked) return;
    const formElement = event.currentTarget;
    const toStatus = new FormData(formElement).get("toStatus");
    if (typeof toStatus !== "string") return;
    setPending(true);
    setNotice(english ? "Updating request status…" : "جارٍ تحديث حالة الطلب…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        locale,
        version: String(request.version),
        toStatus,
      });
      const response = await fetch(
        `/api/admin/requests/${encodeURIComponent(request.requestNumber)}/transition`,
        {
          method: "POST",
          body: form,
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
      );
      const result = (await response.json().catch(() => ({}))) as RequestTransitionWire;
      if (!response.ok || result.request === undefined) throw new Error();
      const updatedRequest = {
        ...result.request,
        updatedAt: new Date(result.request.updatedAt),
      };
      setRequests((current) =>
        current.map((item) => (item.id === updatedRequest.id ? updatedRequest : item)),
      );
      formElement.reset();
      setNotice(english ? "Request status updated." : "تم تحديث حالة الطلب.");
    } catch {
      setNotice(
        english
          ? "The request changed or the status could not be updated. Refresh and try again."
          : "تغيّر الطلب أو تعذر تحديث حالته. حدّث الصفحة ثم حاول مجددًا.",
      );
    } finally {
      setPending(false);
    }
  }

  async function transitionStudentRequest(
    request: UnifiedRequestSummary,
    toStatus: "SUBMITTED" | "REVISION_REQUESTED" | "COMPLETED",
  ) {
    if (csrfToken === undefined || interactionLocked) return;
    setPending(true);
    setNotice(english ? "Confirming your action…" : "جارٍ اعتماد الإجراء…");
    try {
      const form = new URLSearchParams({
        csrfToken,
        version: String(request.version),
        toStatus,
      });
      const response = await fetch(
        `/api/student/requests/${encodeURIComponent(request.requestNumber)}/transition`,
        {
          method: "POST",
          body: form,
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      const result = (await response.json().catch(() => ({}))) as StudentTransitionWire;
      if (
        !response.ok ||
        result.status === undefined ||
        typeof result.requestVersion !== "number"
      ) {
        throw new Error();
      }
      setRequests((current) =>
        current.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: result.status ?? item.status,
                version: result.requestVersion ?? item.version,
                updatedAt: new Date(),
              }
            : item,
        ),
      );
      setNotice(english ? "Your action was confirmed." : "تم اعتماد الإجراء.");
      if (toStatus === "REVISION_REQUESTED") composerRef.current?.focus();
    } catch {
      setNotice(
        english
          ? "The request changed or your action could not be confirmed. Refresh and try again."
          : "تغيّر الطلب أو تعذر اعتماد الإجراء. حدّث الصفحة ثم حاول مجددًا.",
      );
    } finally {
      setPending(false);
    }
  }

  const detailsPanel =
    conversation === undefined ? null : (
      <div className="flex h-full min-h-0 flex-col bg-white">
        <header className="flex h-[4.65rem] shrink-0 items-center justify-between border-b border-[var(--itq-color-border)] px-4">
          <div>
            <h2 className="font-black">{english ? "Requests" : "الطلبات"}</h2>
            <p className="text-xs font-bold text-[var(--itq-color-muted)]">
              {english
                ? `${activeRequestCount} active of ${requests.length}`
                : `${activeRequestCount} نشط من ${requests.length}`}
            </p>
          </div>
          <button
            aria-label={english ? "Close request panel" : "إغلاق لوحة الطلبات"}
            className="grid size-10 place-items-center rounded-xl hover:bg-[var(--itq-color-surface-soft)] xl:hidden"
            onClick={() => closeDetails()}
            type="button"
          >
            <CloseIcon className="size-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {requests.length === 0 ? (
            <div className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-5 text-center">
              <RequestsIcon className="mx-auto size-8 text-[var(--itq-color-muted)]" />
              <p className="mt-3 text-sm font-black">
                {english ? "No requests yet" : "لا توجد طلبات بعد"}
              </p>
              {mode === "student" ? (
                <Link
                  className="mt-3 inline-block text-xs font-black text-[var(--itq-color-brand-700)] underline"
                  href={`/${locale}/student/requests/new`}
                >
                  {english ? "Create a request" : "إنشاء طلب"}
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="grid gap-2">
              {requests.map((request) => {
                const selected = request.id === linkedRequestId;
                const adminTransitions = getAllowedRequestTransitions(
                  request.status,
                  "ADMIN",
                ).filter((status) => status !== "QUOTED");
                const manageHref =
                  mode === "admin"
                    ? `/${locale}/admin/requests/${encodeURIComponent(request.requestNumber)}`
                    : `/${locale}/student/requests/${encodeURIComponent(request.requestNumber)}`;
                return (
                  <li
                    className={`rounded-2xl border p-3 ${
                      selected
                        ? "border-[var(--itq-color-brand-300)] bg-[var(--itq-color-brand-50)]"
                        : "border-[var(--itq-color-border)]"
                    }`}
                    key={request.id}
                  >
                    <button
                      className="w-full text-start"
                      onClick={() => {
                        setLinkedRequestId(request.id);
                        closeDetails(false);
                        composerRef.current?.focus();
                      }}
                      type="button"
                    >
                      <bdi className="block truncate text-sm font-black" dir="auto">
                        {request.title}
                      </bdi>
                      <bdi
                        className="mt-1 block text-[10px] font-bold text-[var(--itq-color-muted)]"
                        dir="ltr"
                      >
                        {request.requestNumber}
                      </bdi>
                      <span className="mt-2 inline-flex">
                        <RequestStatusChip locale={locale} status={request.status} />
                      </span>
                    </button>
                    <Link
                      className="mt-3 flex min-h-9 items-center justify-center rounded-xl border border-[var(--itq-color-border)] bg-white px-3 text-xs font-black no-underline"
                      href={manageHref}
                    >
                      {mode === "admin"
                        ? english
                          ? "Manage request"
                          : "إدارة الطلب"
                        : english
                          ? "Request details"
                          : "تفاصيل الطلب"}
                    </Link>
                    {mode === "admin" && selected && adminTransitions.length > 0 ? (
                      <form
                        className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-[var(--itq-color-border)] pt-2"
                        onSubmit={(event) => void transitionAdminRequest(event, request)}
                      >
                        <label className="sr-only" htmlFor={`quick-status-${request.id}`}>
                          {english ? "New request status" : "حالة الطلب الجديدة"}
                        </label>
                        <select
                          className="h-10 min-w-0 rounded-xl border border-[var(--itq-color-border)] bg-white px-2 text-xs font-black"
                          defaultValue=""
                          id={`quick-status-${request.id}`}
                          name="toStatus"
                          required
                        >
                          <option disabled value="">
                            {english ? "Change status" : "تغيير الحالة"}
                          </option>
                          {adminTransitions.map((status: RequestStatus) => (
                            <option key={status} value={status}>
                              {requestStatusLabel(status, locale)}
                            </option>
                          ))}
                        </select>
                        <button
                          className="min-h-10 rounded-xl bg-[#123640] px-3 text-xs font-black text-white disabled:opacity-50"
                          disabled={interactionLocked}
                          type="submit"
                        >
                          {english ? "Save" : "حفظ"}
                        </button>
                      </form>
                    ) : null}
                    {mode === "student" && selected && request.status === "WAITING_FOR_STUDENT" ? (
                      <button
                        className="mt-2 min-h-10 w-full rounded-xl bg-amber-800 px-3 text-xs font-black text-white disabled:opacity-50"
                        disabled={interactionLocked}
                        onClick={() => void transitionStudentRequest(request, "SUBMITTED")}
                        type="button"
                      >
                        {english
                          ? "I sent the requested information"
                          : "تم إرسال المعلومات المطلوبة"}
                      </button>
                    ) : null}
                    {mode === "student" && selected && request.status === "DELIVERED" ? (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          className="min-h-10 rounded-xl border border-emerald-200 bg-white px-2 text-xs font-black text-emerald-900 disabled:opacity-50"
                          disabled={interactionLocked}
                          onClick={() =>
                            void transitionStudentRequest(request, "REVISION_REQUESTED")
                          }
                          type="button"
                        >
                          {english ? "Request revision" : "طلب تعديل"}
                        </button>
                        <button
                          className="min-h-10 rounded-xl bg-emerald-700 px-2 text-xs font-black text-white disabled:opacity-50"
                          disabled={interactionLocked}
                          onClick={() => void transitionStudentRequest(request, "COMPLETED")}
                          type="button"
                        >
                          {english ? "Confirm receipt" : "تأكيد الاستلام"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {mode === "admin" &&
          selectedRequest !== undefined &&
          !selectedRequestHasPendingQuote &&
          quoteEligibleRequestStatuses.has(selectedRequest.status) ? (
            <details className="mt-4 overflow-hidden rounded-2xl border border-sky-200 bg-sky-50">
              <summary className="cursor-pointer px-4 py-3 text-sm font-black text-sky-950">
                {english ? "Send a price quote" : "إرسال عرض سعر"}
              </summary>
              <form
                className="grid gap-3 border-t border-sky-200 p-4"
                onSubmit={(event) => void createQuote(event)}
              >
                <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2">
                  <label className="grid gap-1 text-xs font-black">
                    {english ? "Amount" : "المبلغ"}
                    <input
                      className="h-11 min-w-0 rounded-xl border border-sky-200 bg-white px-3"
                      inputMode="decimal"
                      maxLength={13}
                      name="amount"
                      placeholder={english ? "0.00" : "٠٫٠٠"}
                      required
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-black">
                    {english ? "Currency" : "العملة"}
                    <select
                      className="h-11 rounded-xl border border-sky-200 bg-white px-2"
                      defaultValue="SAR"
                      name="currency"
                    >
                      <option value="SAR">SAR</option>
                      <option value="AED">AED</option>
                      <option value="KWD">KWD</option>
                    </select>
                  </label>
                </div>
                <label className="grid gap-1 text-xs font-black">
                  الوصف بالعربية
                  <textarea
                    className="min-h-20 rounded-xl border border-sky-200 bg-white p-3"
                    maxLength={2000}
                    minLength={3}
                    name="descriptionAr"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-black">
                  Description in English
                  <textarea
                    className="min-h-20 rounded-xl border border-sky-200 bg-white p-3"
                    dir="ltr"
                    maxLength={2000}
                    minLength={3}
                    name="descriptionEn"
                    required
                  />
                </label>
                <label className="grid gap-1 text-xs font-black">
                  {english ? "Valid until" : "صالح حتى"}
                  <input
                    className="h-11 rounded-xl border border-sky-200 bg-white px-3"
                    name="expiresAt"
                    required
                    type="datetime-local"
                  />
                </label>
                <button
                  className="min-h-11 rounded-xl bg-sky-950 px-4 text-sm font-black text-white disabled:opacity-50"
                  disabled={interactionLocked}
                  type="submit"
                >
                  {english ? "Send quote" : "إرسال العرض"}
                </button>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    );

  if (mode === "admin" && conversation === undefined) {
    return (
      <section
        aria-label={english ? "Unified conversation center" : "مركز المحادثات الموحد"}
        className="relative grid h-full overflow-hidden bg-white lg:grid-cols-[22rem_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 flex-col border-e border-[var(--itq-color-border)] bg-[#f5faf8]">
          <ConversationList
            conversations={contactItems}
            locale={locale}
            {...(search === undefined ? {} : { search })}
          />
        </aside>
        <main className="hidden place-items-center bg-[#edf5f2] p-8 text-center lg:grid">
          <div className="max-w-sm">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-white text-[var(--itq-color-brand-700)] shadow-sm">
              <MessageIcon className="size-9" />
            </span>
            <h1 className="mt-5 text-2xl font-black">
              {english ? "Choose a student conversation" : "اختر محادثة طالب"}
            </h1>
            <p className="mt-2 leading-7 text-[var(--itq-color-muted)]">
              {english
                ? "Messages, requests, updates and quotes are all managed from one workspace."
                : "تدار الرسائل والطلبات والتحديثات وعروض الأسعار من مساحة واحدة."}
            </p>
          </div>
        </main>
      </section>
    );
  }

  return (
    <section
      aria-label={english ? "Unified conversation" : "المحادثة الموحدة"}
      className={`relative grid h-full min-h-0 overflow-hidden border-x border-[var(--itq-color-border)] bg-white ${
        mode === "admin"
          ? "lg:grid-cols-[21rem_minmax(0,1fr)] xl:grid-cols-[21rem_minmax(0,1fr)_19rem]"
          : "xl:grid-cols-[minmax(0,1fr)_20rem]"
      }`}
    >
      {mode === "admin" ? (
        <>
          <button
            aria-label={english ? "Close conversations" : "إغلاق قائمة المحادثات"}
            className={`fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] lg:hidden ${contactsOpen ? "block" : "hidden"}`}
            onClick={() => closeContacts()}
            type="button"
          />
          <aside
            aria-label={english ? "Student conversations" : "محادثات الطلاب"}
            aria-modal={contactsOpen ? true : undefined}
            className={`fixed inset-y-0 start-0 z-50 flex w-[min(88vw,22rem)] min-h-0 flex-col border-e border-[var(--itq-color-border)] bg-[#f5faf8] shadow-2xl transition-[transform,visibility] lg:static lg:z-auto lg:w-auto lg:visible lg:translate-x-0 lg:shadow-none ${
              contactsOpen
                ? "visible translate-x-0"
                : english
                  ? "invisible -translate-x-full"
                  : "invisible translate-x-full"
            }`}
            id={contactsPanelId}
            ref={contactsPanelRef}
            role={contactsOpen ? "dialog" : undefined}
            tabIndex={contactsOpen ? -1 : undefined}
          >
            <ConversationList
              conversations={contactItems}
              locale={locale}
              onClose={() => closeContacts()}
              {...(search === undefined ? {} : { search })}
              {...(conversation === undefined ? {} : { selectedId: conversation.id })}
            />
          </aside>
        </>
      ) : null}

      <main className="flex min-h-0 min-w-0 flex-col bg-[#edf5f2]">
        <header className="flex h-[4.65rem] shrink-0 items-center justify-between gap-3 border-b border-[var(--itq-color-border)] bg-white px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {mode === "admin" ? (
              <button
                aria-controls={contactsPanelId}
                aria-expanded={contactsOpen}
                aria-haspopup="dialog"
                aria-label={english ? "Open conversations" : "فتح قائمة المحادثات"}
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--itq-color-border)] lg:hidden"
                onClick={() => {
                  closeDetails(false);
                  setContactsOpen(true);
                }}
                ref={contactsTriggerRef}
                type="button"
              >
                <MessageIcon className="size-5" />
              </button>
            ) : (
              <Link
                aria-label={english ? "Back to student dashboard" : "العودة إلى لوحة الطالب"}
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-[var(--itq-color-border)] no-underline"
                href={`/${locale}/student`}
              >
                <ArrowIcon className={`size-5 ${english ? "rotate-180" : ""}`} />
              </Link>
            )}
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#123640] text-sm font-black text-white">
              {mode === "admin"
                ? initials(conversation?.studentDisplayName ?? "")
                : english
                  ? "IQ"
                  : "إت"}
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-black sm:text-base">
                <bdi dir="auto">
                  {mode === "admin"
                    ? conversation?.studentDisplayName
                    : english
                      ? "ITQANAK support"
                      : "دعم إتقانك"}
                </bdi>
              </h1>
              <p className="flex items-center gap-1.5 truncate text-[10px] font-bold text-emerald-700 sm:text-xs">
                <span className="size-2 rounded-full bg-emerald-500" />
                {english ? "Private unified conversation" : "محادثة موحدة وخاصة"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-800 sm:inline-flex">
              <ShieldCheckIcon className="size-3.5" /> {english ? "Secure" : "آمنة"}
            </span>
            <button
              aria-controls={detailsPanelId}
              aria-expanded={detailsOpen}
              aria-haspopup="dialog"
              aria-label={english ? "Open requests" : "فتح الطلبات"}
              className="relative grid size-10 place-items-center rounded-xl border border-[var(--itq-color-border)] hover:bg-[var(--itq-color-brand-50)] xl:hidden"
              onClick={() => {
                closeContacts(false);
                setDetailsOpen(true);
              }}
              ref={detailsTriggerRef}
              type="button"
            >
              <RequestsIcon className="size-5" />
              {conversation !== undefined && activeRequestCount > 0 ? (
                <span className="absolute -end-1 -top-1 grid min-w-5 place-items-center rounded-full bg-[var(--itq-color-brand-700)] px-1 text-[9px] font-black text-white">
                  {activeRequestCount}
                </span>
              ) : null}
            </button>
          </div>
        </header>

        {selectedRequest === undefined ? null : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--itq-color-border)] bg-white/90 px-4 py-2 text-xs">
            <button
              aria-controls={detailsPanelId}
              className="flex min-w-0 items-center gap-2 text-start"
              onClick={() => {
                closeContacts(false);
                setDetailsOpen(true);
              }}
              type="button"
            >
              <span className="shrink-0 font-black text-[var(--itq-color-brand-700)]">
                {english ? "Linked:" : "مرتبط:"}
              </span>
              <bdi className="truncate font-bold" dir="auto">
                {selectedRequest.title}
              </bdi>
            </button>
            <span className="flex shrink-0 items-center gap-1.5">
              <RequestStatusChip locale={locale} status={selectedRequest.status} />
              <button
                aria-label={english ? "Send as a general message" : "إرسال كرسالة عامة"}
                className="grid size-7 place-items-center rounded-lg text-[var(--itq-color-muted)] hover:bg-red-50 hover:text-red-700"
                onClick={() => setLinkedRequestId(undefined)}
                title={english ? "Remove request link" : "إلغاء ربط الطلب"}
                type="button"
              >
                <CloseIcon className="size-3.5" />
              </button>
            </span>
          </div>
        )}

        <div
          aria-label={english ? "Conversation messages" : "رسائل المحادثة"}
          aria-live="polite"
          aria-relevant="additions"
          className="relative min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-6"
          onScroll={(event) => {
            const element = event.currentTarget;
            nearBottom.current =
              element.scrollHeight - element.scrollTop - element.clientHeight < 120;
            if (nearBottom.current) setNewMessagesAvailable(false);
          }}
          ref={logRef}
          role="log"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, rgba(20,110,90,.055) 0 1px, transparent 1.5px), radial-gradient(circle at 80% 70%, rgba(20,110,90,.04) 0 1px, transparent 1.5px)",
            backgroundSize: "28px 28px, 36px 36px",
          }}
        >
          {loadedPage < pageCount ? (
            <button
              className="mx-auto mb-5 block rounded-full border border-[var(--itq-color-border)] bg-white px-4 py-2 text-xs font-black shadow-sm disabled:opacity-60"
              disabled={loadingOlder}
              onClick={() => void loadOlder()}
              type="button"
            >
              {loadingOlder
                ? english
                  ? "Loading…"
                  : "جارٍ التحميل…"
                : english
                  ? "Load older messages"
                  : "تحميل رسائل أقدم"}
            </button>
          ) : null}

          {messages.length === 0 ? (
            <div className="grid min-h-full place-items-center py-12 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid size-20 place-items-center rounded-full bg-white text-[var(--itq-color-brand-700)] shadow-sm">
                  <MessageIcon className="size-9" />
                </span>
                <p className="mt-5 text-xl font-black">
                  {english ? "Everything starts here" : "كل شيء يبدأ من هنا"}
                </p>
                <p className="mt-2 text-sm leading-7 text-[var(--itq-color-muted)]">
                  {english
                    ? "Send a message or file. Request updates, actions and quotes will stay in this single conversation."
                    : "أرسل رسالة أو ملفًا؛ وستبقى تحديثات الطلبات والإجراءات وعروض الأسعار في هذه المحادثة الواحدة."}
                </p>
              </div>
            </div>
          ) : (
            <ol className="mx-auto grid max-w-4xl gap-2.5">
              {messages.map((message, index) => {
                const previous = messages[index - 1];
                const showDate =
                  previous === undefined || dateKey(previous.sentAt) !== dateKey(message.sentAt);
                const mine =
                  mode === "admin"
                    ? message.senderType === "ADMIN"
                    : message.senderType === "STUDENT";
                const system =
                  message.senderType === "SYSTEM" ||
                  message.contentType === "SYSTEM" ||
                  message.contentType === "ACTION";
                return (
                  <Fragment key={message.id}>
                    {showDate ? (
                      <li className="sticky top-2 z-10 mx-auto my-2 rounded-full border border-white/70 bg-white/90 px-3 py-1 text-[10px] font-black text-[var(--itq-color-muted)] shadow-sm backdrop-blur">
                        <time dateTime={message.sentAt.toISOString()}>
                          {formatMessageDate(message.sentAt, locale)}
                        </time>
                      </li>
                    ) : null}
                    {message.quote !== undefined ? (
                      <li className="my-2">
                        {message.request === undefined ? null : (
                          <Link
                            className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-[10px] font-black text-[var(--itq-color-brand-700)] no-underline shadow-sm"
                            href={
                              mode === "admin"
                                ? `/${locale}/admin/requests/${encodeURIComponent(message.request.requestNumber)}`
                                : `/${locale}/student/requests/${encodeURIComponent(message.request.requestNumber)}`
                            }
                          >
                            <RequestsIcon className="size-3.5" />
                            <bdi dir="auto">{message.request.title}</bdi>
                          </Link>
                        )}
                        <QuoteCard
                          locale={locale}
                          mode={mode}
                          onRespond={(quote, decision) => void respondToQuote(quote, decision)}
                          onWithdraw={(quote) => void withdrawQuote(quote)}
                          pending={interactionLocked}
                          quote={message.quote}
                        />
                      </li>
                    ) : system ? (
                      <li className="mx-auto my-1 w-full max-w-xl">
                        <article className="rounded-2xl border border-amber-200/80 bg-amber-50/95 px-4 py-3 text-center shadow-sm">
                          <p className="text-xs font-black text-amber-950">
                            <bdi dir="auto">{systemMessageLabel(message, locale)}</bdi>
                          </p>
                          {message.request === undefined ? null : (
                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                              <RequestStatusChip locale={locale} status={message.request.status} />
                              <Link
                                className="text-[10px] font-black text-amber-900 underline"
                                href={
                                  mode === "admin"
                                    ? `/${locale}/admin/requests/${encodeURIComponent(message.request.requestNumber)}`
                                    : `/${locale}/student/requests/${encodeURIComponent(message.request.requestNumber)}`
                                }
                              >
                                {english ? "Open request" : "فتح الطلب"}
                              </Link>
                            </div>
                          )}
                          <time
                            className="mt-2 block text-[9px] font-bold text-amber-800/70"
                            dateTime={message.sentAt.toISOString()}
                          >
                            {formatMessageTime(message.sentAt, locale)}
                          </time>
                        </article>
                      </li>
                    ) : (
                      <li className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <article
                          className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm sm:max-w-[72%] sm:px-4 ${
                            mine
                              ? "rounded-ee-sm bg-[var(--itq-color-brand-700)] text-white"
                              : "rounded-es-sm border border-[var(--itq-color-border)] bg-white text-[var(--itq-color-ink)]"
                          }`}
                        >
                          {!mine ? (
                            <p className="mb-1 text-[10px] font-black text-[var(--itq-color-brand-700)]">
                              <bdi dir="auto">
                                {message.senderDisplayName ??
                                  (mode === "admin"
                                    ? conversation?.studentDisplayName
                                    : english
                                      ? "ITQANAK support"
                                      : "دعم إتقانك")}
                              </bdi>
                            </p>
                          ) : null}
                          {message.request === undefined ? null : (
                            <button
                              className={`mb-2 flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black ${
                                mine
                                  ? "bg-white/10 text-white"
                                  : "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-800)]"
                              }`}
                              onClick={() => setLinkedRequestId(message.request?.id)}
                              type="button"
                            >
                              <RequestsIcon className="size-3" />
                              <bdi className="truncate" dir="auto">
                                {message.request.title}
                              </bdi>
                            </button>
                          )}
                          {message.attachment === undefined || apiBase === undefined ? null : (
                            <AttachmentBody
                              apiBase={apiBase}
                              attachment={message.attachment}
                              contentType={message.contentType}
                              locale={locale}
                              messageId={message.id}
                            />
                          )}
                          {message.contentType === "TEXT" ? (
                            <p className="whitespace-pre-wrap break-words text-sm leading-7">
                              <bdi dir="auto">{message.body}</bdi>
                            </p>
                          ) : null}
                          <footer
                            className={`mt-1.5 flex items-center justify-end gap-1 text-[9px] font-semibold ${
                              mine ? "text-white/70" : "text-[var(--itq-color-muted)]"
                            }`}
                          >
                            <time dateTime={message.sentAt.toISOString()}>
                              {formatMessageTime(message.sentAt, locale)}
                            </time>
                            {mine ? <Receipt locale={locale} status={message.status} /> : null}
                          </footer>
                        </article>
                      </li>
                    )}
                  </Fragment>
                );
              })}
            </ol>
          )}
          {outbox.length > 0 ? (
            <ul className="mx-auto mt-2.5 grid max-w-4xl gap-2.5">
              {outbox.map((entry) => (
                <li className="flex justify-end" key={entry.clientMessageId}>
                  <article className="max-w-[85%] rounded-2xl rounded-ee-sm bg-[var(--itq-color-brand-700)]/80 px-3.5 py-2 text-white shadow-sm sm:max-w-[70%]">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">
                      <bdi dir="auto">{entry.body}</bdi>
                    </p>
                    <footer className="mt-1.5 flex items-center justify-end gap-2 text-[9px] font-semibold text-white/80">
                      {entry.status === "failed" ? (
                        <>
                          <span className="text-amber-200">
                            {english ? "Not sent" : "لم تُرسل"}
                          </span>
                          <button
                            className="rounded-full bg-white/20 px-2 py-0.5 font-black transition hover:bg-white/30"
                            onClick={() => void deliverText(entry)}
                            type="button"
                          >
                            {english ? "Retry" : "إعادة المحاولة"}
                          </button>
                          <button
                            className="rounded-full px-1.5 py-0.5 font-black text-white/60 transition hover:text-white"
                            onClick={() =>
                              setOutbox((current) =>
                                current.filter(
                                  (item) => item.clientMessageId !== entry.clientMessageId,
                                ),
                              )
                            }
                            type="button"
                          >
                            {english ? "Discard" : "تجاهل"}
                          </button>
                        </>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span className="size-1.5 animate-pulse rounded-full bg-white/80" />
                          {english ? "Sending…" : "جارٍ الإرسال…"}
                        </span>
                      )}
                    </footer>
                  </article>
                </li>
              ))}
            </ul>
          ) : null}
          {newMessagesAvailable ? (
            <button
              className="sticky bottom-2 mx-auto mt-4 block rounded-full bg-[#123640] px-4 py-2 text-xs font-black text-white shadow-xl"
              onClick={() => {
                nearBottom.current = true;
                setNewMessagesAvailable(false);
                endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
              }}
              type="button"
            >
              {english ? "New messages ↓" : "رسائل جديدة ↓"}
            </button>
          ) : null}
          <div ref={endRef} />
        </div>

        <footer className="shrink-0 border-t border-[var(--itq-color-border)] bg-white px-2.5 py-2.5 sm:px-4">
          {notice === undefined ? null : (
            <p
              className="mb-2 rounded-xl bg-[var(--itq-color-surface-soft)] px-3 py-2 text-xs font-bold"
              role="status"
            >
              {notice}
            </p>
          )}
          {recording ? (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-800">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-red-600" />
                {english ? "Recording voice message…" : "جارٍ تسجيل رسالة صوتية…"}
              </span>
              <button className="underline" onClick={() => void toggleRecording()} type="button">
                {english ? "Stop & send" : "إيقاف وإرسال"}
              </button>
            </div>
          ) : null}
          <div className="flex items-end gap-1.5 sm:gap-2">
            <input
              accept={acceptedExtensions}
              className="sr-only"
              disabled={interactionLocked}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) void uploadAndSend(file);
              }}
              ref={fileInput}
              type="file"
            />
            <button
              aria-label={english ? "Attach an image or file" : "إرفاق صورة أو ملف"}
              className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--itq-color-muted)] transition hover:bg-[var(--itq-color-brand-50)] disabled:opacity-50"
              disabled={interactionLocked}
              onClick={() => fileInput.current?.click()}
              type="button"
            >
              <PaperclipIcon className="size-5" />
            </button>
            <button
              aria-label={
                recording
                  ? english
                    ? "Stop and send voice message"
                    : "إيقاف الرسالة الصوتية وإرسالها"
                  : english
                    ? "Record a voice message"
                    : "تسجيل رسالة صوتية"
              }
              className={`grid size-11 shrink-0 place-items-center rounded-xl transition disabled:opacity-50 ${
                recording
                  ? "bg-red-600 text-white"
                  : "text-[var(--itq-color-muted)] hover:bg-red-50 hover:text-red-700"
              }`}
              disabled={recordingStarting || (pending && !recording)}
              onClick={() => void toggleRecording()}
              type="button"
            >
              <MicIcon className="size-5" />
            </button>
            <textarea
              aria-label={english ? "Message" : "الرسالة"}
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] px-4 py-2.5 text-sm leading-6 outline-none focus:border-[var(--itq-color-brand-500)] focus:bg-white"
              dir="auto"
              disabled={recording || recordingStarting}
              maxLength={10_000}
              onChange={(event) => setBody(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submitText();
                }
              }}
              placeholder={english ? "Type a message" : "اكتب رسالة"}
              ref={composerRef}
              rows={1}
              value={body}
            />
            <button
              aria-label={english ? "Send message" : "إرسال الرسالة"}
              className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-700)] text-white shadow-sm transition hover:bg-[var(--itq-color-brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={interactionLocked || body.trim().length === 0}
              onClick={() => void submitText()}
              type="button"
            >
              <SendIcon className={`size-5 ${english ? "" : "-scale-x-100"}`} />
            </button>
          </div>
          <p className="mt-1.5 px-2 text-[9px] font-semibold text-[var(--itq-color-muted)]">
            {selectedRequest === undefined
              ? english
                ? "General message · Enter to send, Shift+Enter for a new line"
                : "رسالة عامة · Enter للإرسال وShift+Enter لسطر جديد"
              : english
                ? `Linked to ${selectedRequest.requestNumber}`
                : `مرتبطة بالطلب ${selectedRequest.requestNumber}`}
          </p>
        </footer>
      </main>

      <aside className="hidden min-h-0 border-s border-[var(--itq-color-border)] xl:block">
        {detailsPanel}
      </aside>
      {detailsOpen ? (
        <>
          <button
            aria-label={english ? "Close request panel" : "إغلاق لوحة الطلبات"}
            className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] xl:hidden"
            onClick={() => closeDetails()}
            type="button"
          />
          <aside
            aria-label={english ? "Requests panel" : "لوحة الطلبات"}
            aria-modal="true"
            className="fixed inset-y-0 end-0 z-50 w-[min(92vw,24rem)] border-s border-[var(--itq-color-border)] bg-white shadow-2xl xl:hidden"
            id={detailsPanelId}
            ref={detailsPanelRef}
            role="dialog"
            tabIndex={-1}
          >
            {detailsPanel}
          </aside>
        </>
      ) : null}
    </section>
  );
}
