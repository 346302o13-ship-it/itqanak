"use client";

import Link from "next/link";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

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
  hasAnyQuoteForRequest,
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
import { playUiSound } from "@/lib/ui-sounds";

import { PaymentReceiptUploader } from "./payment-receipt-uploader";

import {
  ArrowIcon,
  CheckCheckIcon,
  CheckIcon,
  ChevronIcon,
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
  /** Active services, so the admin can create a request from the chat panel. */
  readonly services?: readonly { readonly id: string; readonly name: string }[];
}

interface MessageListWire {
  readonly items?: readonly WireUnifiedMessage[];
  readonly page?: number;
  readonly pageCount?: number;
  readonly incremental?: boolean;
  readonly revisionCursor?: string;
}

/** A text message the client has accepted but the server has not yet confirmed. */
interface OutboxEntry {
  readonly clientMessageId: string;
  readonly body: string;
  readonly requestId?: string;
  readonly replyToMessageId?: string;
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

const acceptedExtensions = ".pdf,.docx,.pptx,.xlsx,.txt,.png,.jpg,.jpeg,.webm,.ogg,.mp3,.wav,.mp4";

// Reaction + composer emoji. Mirrors `messageReactionEmojis` in
// @itqanak/requests (the server allowlist); kept inline so this client bundle
// never pulls the server package. First six are the quick-tap bar.
const chatEmoji = [
  "👍",
  "❤️",
  "😂",
  "😮",
  "😢",
  "🙏",
  "👎",
  "🔥",
  "🎉",
  "👏",
  "💯",
  "✅",
  "❌",
  "🤝",
  "🙌",
  "💪",
  "🫡",
  "🤔",
  "😅",
  "😊",
  "😍",
  "🥰",
  "😎",
  "🤩",
  "😴",
  "😭",
  "😡",
  "🤯",
  "😱",
  "🥺",
  "😐",
  "😉",
  "😌",
  "🙄",
  "😳",
  "🤗",
  "🤦",
  "🤷",
  "💔",
  "💚",
  "💙",
  "💛",
  "🧡",
  "💜",
  "⭐",
  "🌟",
  "✨",
  "⚡",
  "💥",
  "📌",
  "📎",
  "📚",
  "✍️",
  "⏰",
  "☑️",
  "🆗",
] as const;
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
  mp4: "video/mp4",
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

function financeChips(
  finance: UnifiedRequestSummary["finance"] | undefined,
  english: boolean,
  mode: "student" | "admin",
  priced: boolean,
): readonly { key: string; className: string; label: string }[] {
  const chips: { key: string; className: string; label: string }[] = [];
  const paid = finance?.dueStatus === "PAID";
  const inLedger = finance?.hasDue === true && finance.dueStatus === "UNPAID";
  if (paid) {
    chips.push({
      key: "paid",
      className: "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-800)]",
      label: english ? "paid" : "تم السداد",
    });
  } else if (inLedger) {
    chips.push({
      key: "ledger",
      className: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-900)]",
      label: english ? "in the ledger" : "في المديونية",
    });
  } else if (priced) {
    chips.push({
      key: "priced",
      className: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-950)]",
      label: english ? "priced" : "تم التسعير",
    });
  } else {
    chips.push({
      key: "unpriced",
      className: "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-muted)]",
      label: english ? "not priced yet" : "لم يُسعّر بعد",
    });
  }
  if (finance?.hasPendingReceipt === true && !paid) {
    chips.push({
      key: "receipt",
      className: "bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-950)]",
      label:
        mode === "admin"
          ? english
            ? "receipt to review"
            : "إيصال للمراجعة"
          : english
            ? "receipt under review"
            : "إيصالك قيد المراجعة",
    });
  }
  return chips;
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
  if (message.body === "PAYMENT_DUE_CREATED") {
    return english ? "A payment is due — upload the receipt" : "مبلغ مستحق — ارفع إيصال الدفع";
  }
  if (message.body === "PAYMENT_RECEIPT_SUBMITTED") {
    return english ? "Payment receipt submitted" : "تم إرسال إيصال الدفع";
  }
  if (message.body === "PAYMENT_REVIEWED") {
    const accepted = message.metadata.decision === "ACCEPT";
    return accepted
      ? english
        ? "Payment confirmed"
        : "تم تأكيد الدفع"
      : english
        ? "Receipt not accepted"
        : "لم يُقبل إيصال الدفع";
  }
  if (message.body === "PAYMENT_REMINDER") {
    return english ? "Payment reminder sent" : "تم إرسال تذكير بالدفع";
  }
  if (message.body === "INVOICE_SUMMARY") {
    return english ? "Outstanding invoice sent" : "تم إرسال فاتورة بالمستحقات";
  }
  return message.body || (english ? "Conversation updated" : "تم تحديث المحادثة");
}

// Keep the conversation readable: most status/system events are hidden, only a
// few milestones show — and those show small.
function isImportantSystemMessage(message: UnifiedMessage): boolean {
  const toStatus =
    typeof message.metadata.toStatus === "string" ? message.metadata.toStatus : undefined;
  if (
    [
      "QUOTE_CREATED",
      "QUOTE_ACCEPTED",
      "QUOTE_REJECTED",
      "REQUEST_CANCELLED",
      "PAYMENT_DUE_CREATED",
      "PAYMENT_RECEIPT_SUBMITTED",
      "PAYMENT_REVIEWED",
      "PAYMENT_REMINDER",
      "INVOICE_SUMMARY",
    ].includes(message.body)
  ) {
    return true;
  }
  if (message.body === "REQUEST_STATUS_CHANGED" || message.body === "STUDENT_ACTION_COMPLETED") {
    return [
      "DELIVERED",
      "COMPLETED",
      "REVISION_REQUESTED",
      "WAITING_FOR_STUDENT",
      "REJECTED",
      "CANCELLED",
    ].includes(toStatus ?? "");
  }
  return false;
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
      className={`inline-flex items-center gap-0.5 ${read ? "text-[var(--itq-color-info-500)]" : ""}`}
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

function paymentMetadataAmount(
  metadata: UnifiedMessage["metadata"],
  english: boolean,
): { readonly amount: string; readonly currency: string; readonly requestNumber: string } {
  const requestNumber = typeof metadata.requestNumber === "string" ? metadata.requestNumber : "";
  const currency = typeof metadata.currency === "string" ? metadata.currency : "SAR";
  const minorUnit = metadata.minorUnit === 3 ? 3 : 2;
  const amountMinor = typeof metadata.amountMinor === "number" ? metadata.amountMinor : 0;
  const amount = (amountMinor / 10 ** minorUnit).toLocaleString(english ? "en-US" : "ar-SA", {
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  });
  return { amount, currency, requestNumber };
}

function PaymentDueCard({
  metadata,
  mode,
  csrfToken,
  duePaid,
  locale,
  onRemind,
  onSubmitted,
  reminderBusy,
  receiptUnderReview,
}: Readonly<{
  metadata: UnifiedMessage["metadata"];
  mode: "student" | "admin";
  csrfToken: string | undefined;
  duePaid: boolean;
  locale: "ar" | "en";
  onRemind: (dueId: string) => void;
  onSubmitted: () => void;
  reminderBusy: boolean;
  receiptUnderReview: boolean;
}>) {
  const english = locale === "en";
  const dueId = typeof metadata.dueId === "string" ? metadata.dueId : undefined;
  const { amount, currency, requestNumber } = paymentMetadataAmount(metadata, english);
  return (
    <div className="rounded-2xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-3.5 shadow-sm">
      <p className="text-xs font-black text-[var(--itq-color-warning-950)]">
        {english ? "Payment due" : "مبلغ مستحق"}
        {requestNumber.length > 0 ? (
          <bdi className="ms-1 font-bold opacity-70" dir="ltr">
            · {requestNumber}
          </bdi>
        ) : null}
      </p>
      <p className="mt-1 text-lg font-black text-[var(--itq-color-warning-950)]" dir="ltr">
        {amount} {currency}
      </p>
      {duePaid ? (
        <p className="mt-2 rounded-xl border border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] px-3 py-2 text-xs font-black text-[var(--itq-color-success-950)]">
          {english ? "Paid ✓" : "تم الدفع ✓"}
        </p>
      ) : mode === "admin" ? (
        <div className="mt-2">
          <p className="text-[10px] font-bold text-[var(--itq-color-warning-900)]">
            {receiptUnderReview
              ? english
                ? "The student sent a receipt — review it below."
                : "أرسل الطالب إيصالًا — راجعه في البطاقة أدناه."
              : english
                ? "Waiting for the student to upload a receipt."
                : "بانتظار رفع الطالب لإيصال الدفع."}
          </p>
          {!receiptUnderReview && dueId !== undefined ? (
            <button
              className="mt-2 min-h-9 rounded-xl border border-[var(--itq-color-warning-300)] bg-[var(--itq-color-surface)] px-3 text-[11px] font-black text-[var(--itq-color-warning-950)] disabled:opacity-50"
              disabled={reminderBusy || csrfToken === undefined}
              onClick={() => onRemind(dueId)}
              type="button"
            >
              {english ? "Send a reminder" : "تذكير الطالب"}
            </button>
          ) : null}
        </div>
      ) : receiptUnderReview ? (
        <p className="mt-2 rounded-xl border border-[var(--itq-color-info-200)] bg-[var(--itq-color-info-50)] px-3 py-2 text-xs font-bold text-[var(--itq-color-info-950)]">
          {english ? "Your receipt is under review." : "إيصالك قيد المراجعة."}
        </p>
      ) : dueId === undefined ? null : (
        <PaymentReceiptUploader
          csrfToken={csrfToken}
          dueId={dueId}
          locale={locale}
          onSubmitted={onSubmitted}
        />
      )}
    </div>
  );
}

/**
 * "Receipt submitted" card in the conversation. The admin gets Accept / Reject
 * right here; the student sees the review state. The receipt image previews via
 * the host-appropriate route.
 */
function PaymentReceiptCard({
  busy,
  csrfToken,
  locale,
  metadata,
  mode,
  onImage,
  onReview,
  reviewState,
}: Readonly<{
  busy: boolean;
  csrfToken: string | undefined;
  locale: "ar" | "en";
  metadata: UnifiedMessage["metadata"];
  mode: "student" | "admin";
  onImage: (source: string, name: string) => void;
  onReview: (submissionId: string, decision: "ACCEPT" | "REJECT") => void;
  reviewState: "PENDING" | "ACCEPTED" | "REJECTED";
}>) {
  const english = locale === "en";
  const { amount, currency, requestNumber } = paymentMetadataAmount(metadata, english);
  const dueId = typeof metadata.dueId === "string" ? metadata.dueId : undefined;
  const submissionId =
    typeof metadata.submissionId === "string" ? metadata.submissionId : undefined;
  const imageSource =
    submissionId === undefined
      ? undefined
      : mode === "admin"
        ? `/api/admin/finance/receipts/${encodeURIComponent(submissionId)}/image`
        : dueId === undefined
          ? undefined
          : `/api/student/finance/dues/${encodeURIComponent(dueId)}/receipt/image?submissionId=${encodeURIComponent(submissionId)}`;
  const statusLabel =
    reviewState === "ACCEPTED"
      ? english
        ? "Payment confirmed ✓"
        : "تم تأكيد الدفع ✓"
      : reviewState === "REJECTED"
        ? english
          ? "Receipt not accepted"
          : "لم يُقبل الإيصال"
        : english
          ? "Under review"
          : "قيد المراجعة";
  const statusTone =
    reviewState === "ACCEPTED"
      ? "border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-950)]"
      : reviewState === "REJECTED"
        ? "border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-950)]"
        : "border-[var(--itq-color-info-200)] bg-[var(--itq-color-info-50)] text-[var(--itq-color-info-950)]";
  return (
    <div className="rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3.5 shadow-sm">
      <p className="text-xs font-black">
        {english ? "Payment receipt" : "إيصال دفع"}
        {requestNumber.length > 0 ? (
          <bdi className="ms-1 font-bold text-[var(--itq-color-muted)]" dir="ltr">
            · {requestNumber}
          </bdi>
        ) : null}
      </p>
      <p className="mt-1 text-base font-black" dir="ltr">
        {amount} {currency}
      </p>
      {imageSource === undefined ? null : (
        <button
          className="mt-2 block w-full overflow-hidden rounded-xl border border-[var(--itq-color-border)]"
          onClick={() => onImage(imageSource, english ? "Payment receipt" : "إيصال الدفع")}
          type="button"
        >
          <img
            alt={english ? "Payment receipt" : "إيصال الدفع"}
            className="max-h-52 w-full object-cover"
            loading="lazy"
            src={imageSource}
          />
        </button>
      )}
      {mode === "admin" && reviewState === "PENDING" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className="min-h-10 rounded-xl border border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] px-3 text-xs font-black text-[var(--itq-color-danger-800)] disabled:opacity-50"
            disabled={busy || submissionId === undefined || csrfToken === undefined}
            onClick={() => submissionId !== undefined && onReview(submissionId, "REJECT")}
            type="button"
          >
            {english ? "Reject" : "رفض"}
          </button>
          <button
            className="min-h-10 rounded-xl bg-[var(--itq-color-success-600)] px-3 text-xs font-black text-white disabled:opacity-50"
            disabled={busy || submissionId === undefined || csrfToken === undefined}
            onClick={() => submissionId !== undefined && onReview(submissionId, "ACCEPT")}
            type="button"
          >
            {english ? "Confirm payment" : "قبول الدفع"}
          </button>
        </div>
      ) : (
        <p className={`mt-3 rounded-xl border px-3 py-2 text-xs font-black ${statusTone}`}>
          {statusLabel}
        </p>
      )}
    </div>
  );
}

/** "Everything you owe" card: the per-currency totals from a consolidated invoice. */
function InvoiceSummaryCard({
  locale,
  metadata,
}: Readonly<{
  locale: "ar" | "en";
  metadata: UnifiedMessage["metadata"];
}>) {
  const english = locale === "en";
  const rawLines = Array.isArray(metadata.lines) ? metadata.lines : [];
  const lines = rawLines.flatMap((line) => {
    if (typeof line !== "object" || line === null) return [];
    const record = line as Record<string, unknown>;
    const currency = typeof record.currency === "string" ? record.currency : "SAR";
    const minorUnit = record.minorUnit === 3 ? 3 : 2;
    const totalMinor = typeof record.totalMinor === "number" ? record.totalMinor : 0;
    const count = typeof record.count === "number" ? record.count : 0;
    return [
      {
        currency,
        count,
        total: (totalMinor / 10 ** minorUnit).toLocaleString(english ? "en-US" : "ar-SA", {
          minimumFractionDigits: minorUnit,
          maximumFractionDigits: minorUnit,
        }),
      },
    ];
  });
  return (
    <div className="rounded-2xl border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-3.5 shadow-sm">
      <p className="text-xs font-black text-[var(--itq-color-brand-strong)]">
        {english ? "Outstanding invoice" : "فاتورة بكل المستحقات"}
      </p>
      <ul className="mt-2 grid gap-1">
        {lines.map((line) => (
          <li
            className="flex items-baseline justify-between gap-3 text-sm font-black"
            key={line.currency}
          >
            <span dir="ltr">
              {line.total} {line.currency}
            </span>
            <span className="text-[10px] font-bold text-[var(--itq-color-muted)]">
              {english ? `${line.count} due(s)` : `${line.count} مستحق`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One compact form inside an admin request card: pick "price quote" (student
 * approves) or "direct ledger charge", type an amount, send. Stacked so it fits
 * the narrow card — amount on its own row, currency + action below.
 */
function PricingForm({
  allowCharge,
  allowQuote,
  english,
  locked,
  onCharge,
  onQuote,
}: Readonly<{
  allowCharge: boolean;
  allowQuote: boolean;
  english: boolean;
  locked: boolean;
  onCharge: (event: React.FormEvent<HTMLFormElement>) => void;
  onQuote: (event: React.FormEvent<HTMLFormElement>) => void;
}>) {
  const [ledger, setLedger] = useState(!allowQuote);
  const useLedger = ledger || !allowQuote;
  const both = allowQuote && allowCharge;
  return (
    <form
      className="grid gap-2 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-3"
      onSubmit={(event) => (useLedger ? onCharge(event) : onQuote(event))}
    >
      {both ? (
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-[var(--itq-color-surface)] p-1 text-[11px] font-black">
          <button
            className={`rounded-md py-1.5 ${
              useLedger
                ? "text-[var(--itq-color-muted)]"
                : "bg-[var(--itq-color-info-950)] text-white"
            }`}
            onClick={() => setLedger(false)}
            type="button"
          >
            {english ? "Price quote" : "عرض سعر"}
          </button>
          <button
            className={`rounded-md py-1.5 ${
              useLedger
                ? "bg-[var(--itq-color-ink-deep)] text-white"
                : "text-[var(--itq-color-muted)]"
            }`}
            onClick={() => setLedger(true)}
            type="button"
          >
            {english ? "Direct ledger" : "مديونية مباشرة"}
          </button>
        </div>
      ) : (
        <p className="text-[11px] font-black">
          {useLedger
            ? english
              ? "Add a charge to the ledger"
              : "إضافة مبلغ إلى المديونية"
            : english
              ? "Set the price for this request"
              : "حدّد سعر هذا الطلب"}
        </p>
      )}
      <input
        aria-label={english ? "Amount" : "المبلغ"}
        className="h-11 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 text-sm font-black"
        inputMode="decimal"
        maxLength={13}
        name="amount"
        placeholder={english ? "0.00" : "٠٫٠٠"}
        required
      />
      <div className="flex gap-2">
        <select
          aria-label={english ? "Currency" : "العملة"}
          className="h-11 w-20 shrink-0 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
          defaultValue="SAR"
          name="currency"
        >
          <option value="SAR">SAR</option>
          <option value="AED">AED</option>
          <option value="KWD">KWD</option>
        </select>
        <button
          className={`h-11 flex-1 rounded-xl px-4 text-sm font-black text-white disabled:opacity-50 ${
            useLedger ? "bg-[var(--itq-color-ink-deep)]" : "bg-[var(--itq-color-info-950)]"
          }`}
          disabled={locked}
          type="submit"
        >
          {useLedger ? (english ? "Add" : "إضافة") : english ? "Send" : "إرسال"}
        </button>
      </div>
      <p className="text-[10px] font-semibold text-[var(--itq-color-muted)]">
        {useLedger
          ? english
            ? "Recorded now as an unpaid due — no student approval."
            : "يُسجَّل فورًا كمستحق غير مدفوع دون موافقة الطالب."
          : english
            ? "The student gets an Approve / Reject card. Valid 7 days."
            : "يصل الطالب بطاقة موافقة / رفض. صالحة ٧ أيام."}
      </p>
    </form>
  );
}

/**
 * Price several un-priced requests at once, then send one consolidated invoice.
 * Each row takes an amount; one currency for the batch.
 */
function BulkPricePanel({
  english,
  locked,
  onCharge,
  onInvoice,
  requests,
}: Readonly<{
  english: boolean;
  locked: boolean;
  onCharge: (requestNumber: string, amount: string, currency: string) => Promise<boolean>;
  onInvoice: () => Promise<void>;
  requests: readonly UnifiedRequestSummary[];
}>) {
  const [amounts, setAmounts] = useState<Readonly<Record<string, string>>>({});
  const [currency, setCurrency] = useState("SAR");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();

  async function run(): Promise<void> {
    setBusy(true);
    setDone(undefined);
    let priced = 0;
    for (const request of requests) {
      const raw = (amounts[request.id] ?? "").trim();
      if (!/^\d{1,9}(?:[.,]\d{1,2})?$/u.test(raw)) continue;
      if (await onCharge(request.requestNumber, raw.replace(",", "."), currency)) priced += 1;
    }
    await onInvoice();
    setDone(
      english
        ? `Priced ${priced} request(s) and sent the invoice.`
        : `تم تسعير ${priced} طلب وإرسال الفاتورة.`,
    );
    setBusy(false);
  }

  return (
    <div className="mt-2 grid gap-2 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-black">
          {english ? "Price the un-priced requests" : "سعّر الطلبات غير المسعّرة"}
        </p>
        <select
          aria-label={english ? "Currency" : "العملة"}
          className="h-8 rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 text-[11px] font-black"
          onChange={(event) => setCurrency(event.currentTarget.value)}
          value={currency}
        >
          <option value="SAR">SAR</option>
          <option value="AED">AED</option>
        </select>
      </div>
      {requests.map((request) => (
        <label className="grid grid-cols-[1fr_6.5rem] items-center gap-2" key={request.id}>
          <bdi className="truncate text-[11px] font-bold" dir="auto">
            {request.title}
          </bdi>
          <input
            className="h-9 w-full rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
            inputMode="decimal"
            maxLength={12}
            onChange={(event) =>
              setAmounts((current) => ({ ...current, [request.id]: event.currentTarget.value }))
            }
            placeholder={english ? "0.00" : "٠٫٠٠"}
            value={amounts[request.id] ?? ""}
          />
        </label>
      ))}
      <button
        className="mt-1 h-10 rounded-xl bg-[var(--itq-color-ink-deep)] px-3 text-xs font-black text-white disabled:opacity-50"
        disabled={busy || locked}
        onClick={() => void run()}
        type="button"
      >
        {busy
          ? english
            ? "Working…"
            : "جارٍ التنفيذ…"
          : english
            ? "Price all & send invoice"
            : "سعّر الكل وأرسل فاتورة"}
      </button>
      {done === undefined ? null : (
        <p className="text-[10px] font-bold text-[var(--itq-color-success-800)]">{done}</p>
      )}
    </div>
  );
}

function QuoteCard({
  locale,
  mode,
  onRespond,
  onWithdraw,
  optimisticDecision,
  pending,
  quote,
}: Readonly<{
  locale: "ar" | "en";
  mode: "student" | "admin";
  onRespond: (quote: ServiceQuote, decision: "ACCEPT" | "REJECT") => void;
  onWithdraw: (quote: ServiceQuote) => void;
  optimisticDecision?: "ACCEPT" | "REJECT" | undefined;
  pending: boolean;
  quote: ServiceQuote;
}>) {
  const english = locale === "en";
  const rawStatus =
    quote.status === "PENDING" && optimisticDecision !== undefined
      ? optimisticDecision === "ACCEPT"
        ? "ACCEPTED"
        : "REJECTED"
      : quote.status;
  const displayStatus =
    rawStatus === "PENDING" && quote.expiresAt.getTime() <= Date.now() ? "EXPIRED" : rawStatus;
  // Once the student has answered (locally or on the server) the buttons are gone
  // for good — a tap must not leave them live.
  const actionable =
    mode === "student" && displayStatus === "PENDING" && optimisticDecision === undefined;
  const withdrawable = mode === "admin" && displayStatus === "PENDING";
  const accepted = displayStatus === "ACCEPTED";
  const rejected = displayStatus === "REJECTED" || displayStatus === "WITHDRAWN";
  return (
    <article className="mx-auto w-full max-w-xl overflow-hidden rounded-[1.35rem] border border-[var(--itq-color-info-200)] bg-[var(--itq-color-surface)] shadow-sm">
      <header className="flex items-center justify-between gap-3 bg-[var(--itq-color-info-950)] px-4 py-3 text-white sm:px-5">
        <span className="inline-flex items-center gap-2 text-sm font-black">
          <span className="grid size-8 place-items-center rounded-xl bg-white/10">﷼</span>
          {english ? "Price quote" : "عرض سعر"}
        </span>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
            accepted
              ? "bg-[color-mix(in_srgb,var(--itq-color-success-500)_22%,transparent)] text-[var(--itq-color-success-100)]"
              : rejected
                ? "bg-[color-mix(in_srgb,var(--itq-color-danger-500)_22%,transparent)] text-[var(--itq-color-danger-100)]"
                : "bg-white/10 text-white"
          }`}
        >
          {quoteStatusLabel(displayStatus, locale)}
        </span>
      </header>
      <div className="p-4 sm:p-5">
        <p className="text-2xl font-black text-[var(--itq-color-info-950)]" dir="ltr">
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
          <div className="mt-4 border-t border-[var(--itq-color-info-100)] pt-4">
            <p className="mb-3 rounded-xl bg-[var(--itq-color-warning-50)] px-3 py-2 text-xs font-bold leading-5 text-[var(--itq-color-warning-950)]">
              {english
                ? "Accepting creates an unpaid amount due on your account for this quote."
                : "الموافقة تنشئ مستحقًا غير مدفوع في حسابك بقيمة هذا العرض."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                className="min-h-11 rounded-xl border border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] px-4 text-sm font-black text-[var(--itq-color-danger-800)] transition hover:bg-[var(--itq-color-danger-100)] disabled:opacity-50"
                disabled={pending}
                onClick={() => onRespond(quote, "REJECT")}
                type="button"
              >
                {english ? "Decline" : "رفض العرض"}
              </button>
              <button
                className="min-h-11 rounded-xl bg-[var(--itq-color-success-600)] px-4 text-sm font-black text-white transition hover:bg-[var(--itq-color-success-700)] disabled:opacity-50"
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
          <div className="mt-4 border-t border-[var(--itq-color-info-100)] pt-4">
            <p className="mb-3 text-xs font-bold leading-5 text-[var(--itq-color-muted)]">
              {english
                ? "Withdraw this pending quote before sending a corrected replacement."
                : "اسحب العرض المعلّق أولًا إذا أردت إرسال عرض بديل مصحح."}
            </p>
            <button
              className="min-h-11 w-full rounded-xl border border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] px-4 text-sm font-black text-[var(--itq-color-danger-800)] transition hover:bg-[var(--itq-color-danger-100)] disabled:opacity-50"
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
  onOpenImage,
}: Readonly<{
  apiBase: string;
  attachment: NonNullable<UnifiedMessage["attachment"]>;
  contentType: UnifiedMessage["contentType"];
  locale: "ar" | "en";
  messageId: string;
  onOpenImage: (image: { src: string; download: string; name: string }) => void;
}>) {
  const english = locale === "en";
  const download = `${apiBase}/messages/${encodeURIComponent(messageId)}/attachment`;
  const preview = `${download}/preview`;

  const isVideo = attachment.mimeType.startsWith("video/");
  const expired = attachment.storageStatus === "EXPIRED";

  if (expired) {
    return (
      <div className="flex min-h-12 items-center gap-2.5 rounded-xl border border-dashed border-current/25 px-3 py-2 text-xs font-bold text-[var(--itq-color-bubble-meta)]">
        <PaperclipIcon className="size-4 shrink-0" />
        <span className="min-w-0">
          <bdi className="block truncate" dir="auto">
            {attachment.originalFilename}
          </bdi>
          <span className="mt-0.5 block">
            {english ? "No longer available (removed from the server)" : "لم يعد هذا الملف متوفراً"}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      {isVideo ? (
        <video
          className="max-h-[22rem] w-full rounded-xl bg-black"
          controls
          preload="metadata"
          src={preview}
        >
          <a href={download}>{english ? "Download video" : "تنزيل الفيديو"}</a>
        </video>
      ) : contentType === "IMAGE" ? (
        <button
          className="block w-full overflow-hidden rounded-xl bg-black/5"
          onClick={() => onOpenImage({ src: preview, download, name: attachment.originalFilename })}
          type="button"
        >
          <img
            alt={attachment.originalFilename}
            className="max-h-[22rem] w-full object-contain"
            loading="lazy"
            src={preview}
          />
        </button>
      ) : contentType === "AUDIO" ? (
        <div className="min-w-56 max-w-full">
          <audio className="w-full" controls preload="metadata" src={preview}>
            <a href={download}>{english ? "Download voice message" : "تنزيل الرسالة الصوتية"}</a>
          </audio>
          <a className="mt-2 block truncate text-xs font-black underline" href={download}>
            <bdi dir="auto">{attachment.originalFilename}</bdi>
          </a>
        </div>
      ) : (
        <a
          className="flex min-h-14 items-center gap-3 rounded-xl border border-current/15 bg-[var(--itq-color-surface)]/70 p-3 font-black text-[var(--itq-color-ink)] no-underline"
          href={download}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]">
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
              className="grid size-10 place-items-center rounded-2xl bg-[var(--itq-color-surface)] text-[var(--itq-color-muted)] shadow-sm lg:hidden"
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
            className="h-11 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] ps-10 pe-3 text-sm outline-none focus:border-[var(--itq-color-brand-500)]"
            defaultValue={search}
            maxLength={100}
            name="q"
            placeholder={english ? "Name, mobile or email" : "الاسم أو الجوال أو البريد"}
          />
        </form>
      </div>
      <div className="itq-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-2" role="list">
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
                    : "border-transparent hover:bg-[var(--itq-color-surface)]"
                }`}
                href={href}
                key={item.id}
                role="listitem"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--itq-color-ink-deep)] text-sm font-black text-white">
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
                      <span className="grid min-w-5 shrink-0 place-items-center rounded-full bg-[var(--itq-color-success-600)] px-1.5 py-0.5 text-[10px] font-black text-white">
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
  services = [],
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
  // Companion cursor: everything edited/deleted at or before this instant is
  // already reflected locally. Sent as `revisedAfter` so revisions to older
  // messages are not missed by an `afterId`-only poll.
  const revisionCursorRef = useRef<string | undefined>(initialMessagePage.revisionCursor);
  // Set by the poll effects; the SSE stream calls these to fetch a delta at once.
  const messagePokeRef = useRef<() => void>(() => undefined);
  const contactPokeRef = useRef<() => void>(() => undefined);
  const conversationIdRef = useRef<string | undefined>(conversation?.id);
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeMatch, setActiveMatch] = useState(0);
  const [highlightId, setHighlightId] = useState<string>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [replyingTo, setReplyingTo] = useState<
    { readonly id: string; readonly body: string; readonly senderType: string } | undefined
  >(undefined);
  const [reactionPickerFor, setReactionPickerFor] = useState<string>();
  const [reactionPickerFull, setReactionPickerFull] = useState(false);
  const [emojiPanelOpen, setEmojiPanelOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    readonly src: string;
    readonly download: string;
    readonly name: string;
  }>();
  const longPressTimer = useRef<number | undefined>(undefined);
  const reactionChoices = chatEmoji.slice(0, 6);
  const [editingId, setEditingId] = useState<string>();
  const [editingText, setEditingText] = useState("");
  const [deleteConfirmFor, setDeleteConfirmFor] = useState<string>();
  // Quotes the student has answered in this session: the card locks its action
  // buttons at once (WhatsApp-style) and never re-offers them, even if a poll
  // briefly returns a stale PENDING copy before the response reconciles.
  const [quoteDecisions, setQuoteDecisions] = useState<ReadonlyMap<string, "ACCEPT" | "REJECT">>(
    new Map(),
  );
  // Admin request card whose pricing / ledger controls are unfolded. One at a
  // time, collapsed by default, right inside the request's own card.
  const [expandedRequestId, setExpandedRequestId] = useState<string>();

  const closeContacts = useCallback((restoreFocus = true): void => {
    setContactsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => contactsTriggerRef.current?.focus());
  }, []);
  const closeDetails = useCallback((restoreFocus = true): void => {
    setDetailsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => detailsTriggerRef.current?.focus());
  }, []);

  const selectedRequest = requests.find((request) => request.id === linkedRequestId);
  const activeRequestCount = requests.filter(
    (request) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(request.status),
  ).length;
  const interactionLocked = pending || recording || recordingStarting;
  const [livePresenceAt, setLivePresenceAt] = useState<number>();
  const studentLastSeenMs = Math.max(
    conversation?.studentLastSeenAt?.getTime() ?? 0,
    livePresenceAt ?? 0,
  );
  const studentLastSeen = studentLastSeenMs > 0 ? new Date(studentLastSeenMs) : undefined;
  const studentOnline =
    studentLastSeen !== undefined && Date.now() - studentLastSeen.getTime() < 3 * 60_000;
  const studentLastSeenLabel =
    studentLastSeen === undefined
      ? english
        ? "Not signed in"
        : "غير متصل"
      : `${english ? "Last seen " : "آخر ظهور "}${formatMessageTime(studentLastSeen, locale)}`;
  const apiBase =
    mode === "student"
      ? "/api/student/conversation"
      : conversation === undefined
        ? undefined
        : `/api/admin/conversations/${encodeURIComponent(conversation.studentUserId)}`;

  useEffect(() => {
    // Seed from the on-device cache first so re-opening a conversation shows
    // history instantly and older-page fetches are not repeated, then fold the
    // server-fresh page on top.
    let seeded: UnifiedMessage[] = [...initialMessagePage.items];
    const cacheKey = conversation === undefined ? undefined : `itqanak.chat.v1.${conversation.id}`;
    if (cacheKey !== undefined) {
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (raw !== null) {
          const cached = JSON.parse(raw) as WireUnifiedMessage[];
          if (Array.isArray(cached) && cached.length > 0) {
            seeded = mergeUnifiedMessages(seeded, cached);
          }
        }
      } catch {
        // Ignore unreadable / disabled storage.
      }
    }
    setMessages(seeded);
    setOutbox([]);
    setLoadedPage(initialMessagePage.page);
    setPageCount(initialMessagePage.pageCount ?? 1);
    setRequests([...(conversation?.requests ?? [])]);
    setLinkedRequestId(selectedRequestId);
    setContactsOpen(conversation === undefined);
    setDetailsOpen(false);
    setEditingId(undefined);
    setDeleteConfirmFor(undefined);
    previousLastMessageId.current = seeded.at(-1)?.id;
    latestMessageIdRef.current = seeded.at(-1)?.id;
    revisionCursorRef.current = initialMessagePage.revisionCursor;
  }, [conversation, initialMessagePage, selectedRequestId]);

  // Persist the tail of the conversation to the device (best effort, capped).
  useEffect(() => {
    if (conversation === undefined || messages.length === 0) return;
    try {
      window.localStorage.setItem(
        `itqanak.chat.v1.${conversation.id}`,
        JSON.stringify(messages.slice(-250)),
      );
    } catch {
      // Quota / private mode — the network remains the source of truth.
    }
  }, [messages, conversation]);

  useEffect(() => {
    setContactItems([...conversations]);
  }, [conversations]);

  // Keep the student's "online / last seen" fresh while the admin has the
  // conversation open.
  useEffect(() => {
    if (mode !== "admin" || conversation === undefined) return undefined;
    let active = true;
    const studentUserId = conversation.studentUserId;
    const check = async () => {
      try {
        const response = await fetch(
          `/api/admin/conversations/${encodeURIComponent(studentUserId)}/presence`,
          {
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
          },
        );
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { lastSeenAt?: string | null };
        if (active && typeof payload.lastSeenAt === "string") {
          setLivePresenceAt(new Date(payload.lastSeenAt).getTime());
        }
      } catch {
        // Presence is cosmetic; ignore transient failures.
      }
    };
    void check();
    const timer = window.setInterval(check, 45_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [mode, conversation]);

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
        messages
          .map((message) => message.clientMessageId)
          .filter((id): id is string => id !== undefined),
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
    const mySenderType = mode === "admin" ? "ADMIN" : "STUDENT";
    const last = messages.at(-1);
    if (last !== undefined && last.senderType !== mySenderType && last.senderType !== "SYSTEM") {
      playUiSound("receive");
    }
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

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchMatches = useMemo(() => {
    if (normalizedSearch.length < 2) return [] as string[];
    return messages
      .filter(
        (message) =>
          message.contentType === "TEXT" &&
          typeof message.body === "string" &&
          message.body.toLowerCase().includes(normalizedSearch),
      )
      .map((message) => message.id);
  }, [messages, normalizedSearch]);

  const openReactionMenu = useCallback((id: string) => {
    setReactionPickerFull(false);
    setReactionPickerFor(id);
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(12);
    }
  }, []);

  // Press-and-hold (touch) or right-click (desktop) on a bubble opens its
  // reaction bar, the way a chat app does.
  const bubbleHoldHandlers = useCallback(
    (id: string) => ({
      onContextMenu: (event: ReactMouseEvent) => {
        event.preventDefault();
        openReactionMenu(id);
      },
      onPointerDown: (event: ReactPointerEvent) => {
        if (event.pointerType === "mouse") return;
        window.clearTimeout(longPressTimer.current);
        longPressTimer.current = window.setTimeout(() => openReactionMenu(id), 420);
      },
      onPointerUp: () => window.clearTimeout(longPressTimer.current),
      onPointerMove: () => window.clearTimeout(longPressTimer.current),
      onPointerCancel: () => window.clearTimeout(longPressTimer.current),
      onPointerLeave: () => window.clearTimeout(longPressTimer.current),
    }),
    [openReactionMenu],
  );

  // Tap anywhere outside an open chat menu (reaction bar, emoji tray) closes it.
  useEffect(() => {
    if (reactionPickerFor === undefined && !emojiPanelOpen) return undefined;
    const onOutside = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-chat-menu]")) return;
      setReactionPickerFor(undefined);
      setReactionPickerFull(false);
      setEmojiPanelOpen(false);
    };
    document.addEventListener("pointerdown", onOutside, true);
    return () => document.removeEventListener("pointerdown", onOutside, true);
  }, [reactionPickerFor, emojiPanelOpen]);

  const scrollToMessage = useCallback((id: string) => {
    const node = logRef.current?.querySelector(`[data-mid="${id}"]`);
    if (node === null || node === undefined) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightId(id);
    window.setTimeout(
      () => setHighlightId((current) => (current === id ? undefined : current)),
      1_800,
    );
  }, []);

  const jumpToMatch = useCallback(
    (index: number) => {
      if (searchMatches.length === 0) return;
      const bounded =
        ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
      setActiveMatch(bounded);
      const id = searchMatches[bounded];
      if (id !== undefined) scrollToMessage(id);
    },
    [searchMatches, scrollToMessage],
  );

  useEffect(() => {
    if (searchOpen) window.requestAnimationFrame(() => searchInputRef.current?.focus());
  }, [searchOpen]);

  // Jump to the first hit when the term changes, but never yank the scroll on a
  // later poll that only changed the match set.
  const lastSearchRef = useRef(normalizedSearch);
  useEffect(() => {
    if (lastSearchRef.current === normalizedSearch) return;
    lastSearchRef.current = normalizedSearch;
    if (searchMatches.length > 0) jumpToMatch(0);
    else setActiveMatch(0);
  }, [normalizedSearch, searchMatches, jumpToMatch]);

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
    conversationIdRef.current = conversation?.id;
  }, [conversation?.id]);

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
    contactPokeRef.current = () => {
      if (!cancelled && !inFlight) schedule(150);
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
      contactPokeRef.current = () => undefined;
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
          if (revisionCursorRef.current !== undefined) {
            messageQuery.set("revisedAfter", revisionCursorRef.current);
          }
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
          if (typeof result.revisionCursor === "string") {
            revisionCursorRef.current = result.revisionCursor;
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
    messagePokeRef.current = () => {
      if (!cancelled && !inFlight) schedule(150);
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
      messagePokeRef.current = () => undefined;
      if (timeout !== undefined) window.clearTimeout(timeout);
      controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [apiBase, conversation]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const url =
      mode === "admin" ? "/api/admin/conversations/stream" : "/api/student/conversation/stream";
    let source: EventSource | undefined;
    let retryTimer: number | undefined;
    let stopped = false;

    const open = () => {
      if (stopped) return;
      source = new EventSource(url);
      source.onmessage = (event) => {
        let payload: { conversationId?: string; senderType?: string };
        try {
          payload = JSON.parse(event.data) as { conversationId?: string; senderType?: string };
        } catch {
          return;
        }
        if (mode === "admin") {
          contactPokeRef.current();
          if (
            payload.conversationId === conversationIdRef.current &&
            payload.senderType !== "ADMIN"
          ) {
            messagePokeRef.current();
          }
        } else if (payload.senderType !== "STUDENT") {
          messagePokeRef.current();
        }
      };
      source.onerror = () => {
        // EventSource retries transient drops itself; a hard close needs a manual
        // reopen. Either way the polls remain the reliable transport.
        if (source?.readyState === EventSource.CLOSED && !stopped) {
          source.close();
          source = undefined;
          retryTimer = window.setTimeout(open, 15_000);
        }
      };
    };
    open();

    return () => {
      stopped = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      source?.close();
    };
  }, [mode]);

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
    playUiSound("send");
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
      ...(entry.replyToMessageId === undefined ? {} : { replyToMessageId: entry.replyToMessageId }),
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
      ...(replyingTo === undefined ? {} : { replyToMessageId: replyingTo.id }),
      status: "sending",
    };
    setOutbox((current) => [...current, entry]);
    setBody("");
    setReplyingTo(undefined);
    setNotice(undefined);
    nearBottom.current = true;
    // Keep the keyboard up after sending, WhatsApp-style.
    composerRef.current?.focus();
    window.requestAnimationFrame(() => {
      composerRef.current?.focus();
      endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    void deliverText(entry);
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (apiBase === undefined || csrfToken === undefined) return;
    // Optimistic: flip mine / adjust count locally, reconcile on the next poll.
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        const existing = message.reactions ?? [];
        const hit = existing.find((reaction) => reaction.emoji === emoji);
        let next: { emoji: string; count: number; mine: boolean }[];
        if (hit === undefined) {
          next = [...existing, { emoji, count: 1, mine: true }];
        } else if (hit.mine) {
          next = existing
            .map((reaction) =>
              reaction.emoji === emoji
                ? { ...reaction, count: reaction.count - 1, mine: false }
                : reaction,
            )
            .filter((reaction) => reaction.count > 0);
        } else {
          next = existing.map((reaction) =>
            reaction.emoji === emoji
              ? { ...reaction, count: reaction.count + 1, mine: true }
              : reaction,
          );
        }
        return { ...message, reactions: next };
      }),
    );
    try {
      await fetch(`${apiBase}/messages/${encodeURIComponent(messageId)}/reactions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, emoji }),
      });
    } catch {
      // The next poll / stream delta restores the true state.
    }
  }

  async function submitEdit(messageId: string): Promise<void> {
    if (apiBase === undefined || csrfToken === undefined) return;
    const trimmed = editingText.trim();
    if (trimmed.length === 0) return;
    const original = messages.find((message) => message.id === messageId);
    if (original !== undefined && original.body === trimmed) {
      setEditingId(undefined);
      return;
    }
    try {
      const response = await fetch(`${apiBase}/messages/${encodeURIComponent(messageId)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken, body: trimmed }),
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (!response.ok || result.message === undefined || typeof result.message === "string") {
        setNotice(english ? "The message could not be edited." : "تعذر تعديل الرسالة.");
        return;
      }
      const edited = result.message;
      setMessages((current) => mergeUnifiedMessages(current, [edited]));
      setEditingId(undefined);
      setEditingText("");
    } catch {
      setNotice(english ? "The message could not be edited." : "تعذر تعديل الرسالة.");
    }
  }

  async function deleteMessage(messageId: string): Promise<void> {
    if (apiBase === undefined || csrfToken === undefined) return;
    setDeleteConfirmFor(undefined);
    try {
      const response = await fetch(`${apiBase}/messages/${encodeURIComponent(messageId)}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ csrfToken }),
      });
      const result = (await response.json().catch(() => ({}))) as MessageMutationWire;
      if (!response.ok || result.message === undefined || typeof result.message === "string") {
        setNotice(english ? "The message could not be deleted." : "تعذر حذف الرسالة.");
        return;
      }
      const removed = result.message;
      setMessages((current) => mergeUnifiedMessages(current, [removed]));
    } catch {
      setNotice(english ? "The message could not be deleted." : "تعذر حذف الرسالة.");
    }
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

  // Shrink big photos in the browser before upload, the way a messenger does:
  // cap the long edge and re-encode as JPEG so a 6 MB camera shot lands as a
  // few hundred KB. Non-images (and small images) pass through untouched.
  async function compressImageForUpload(original: File): Promise<File> {
    if (!/^image\/(jpe?g|png)$/iu.test(original.type)) return original;
    if (typeof createImageBitmap !== "function") return original;
    const maxDimension = 1600;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(original);
    } catch {
      return original;
    }
    try {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      if (scale === 1 && original.type === "image/jpeg" && original.size < 500_000) {
        return original;
      }
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (context === null) return original;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((value) => resolve(value), "image/jpeg", 0.82);
      });
      if (blob === null || blob.size >= original.size) return original;
      const base = original.name.replace(/\.[^.]+$/u, "") || "image";
      return new File([blob], `${base}.jpg`, {
        type: "image/jpeg",
        lastModified: Date.now(),
      });
    } finally {
      bitmap.close();
    }
  }

  async function uploadAndSend(input: File, source: "picker" | "recording" = "picker") {
    if (
      apiBase === undefined ||
      pending ||
      (source === "picker" && (recording || recordingStarting))
    ) {
      return;
    }
    const file = source === "picker" ? await compressImageForUpload(input) : input;
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
      const ready = await waitForAttachment(result.attachment);
      const sent = await sendMessage({
        contentType: contentTypeForMime(ready.mimeType),
        attachmentId: result.attachment.id,
        ...(linkedRequestId === undefined ? {} : { requestId: linkedRequestId }),
      });
      if (sent) {
        setNotice(undefined);
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
    if (quoteDecisions.has(quote.id)) return;
    setPending(true);
    // Lock the card immediately; the buttons must not stay tappable after a tap.
    setQuoteDecisions((current) => new Map(current).set(quote.id, decision));
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
      // The save failed: unlock so the student can try again.
      setQuoteDecisions((current) => {
        const next = new Map(current);
        next.delete(quote.id);
        return next;
      });
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
      const rawExpiry = String(fields.get("expiresAt") ?? "").trim();
      const expiresAt =
        rawExpiry.length > 0 ? new Date(rawExpiry) : new Date(Date.now() + 7 * 86_400_000);
      const descriptionAr =
        String(fields.get("descriptionAr") ?? "").trim() ||
        `عرض سعر للطلب ${selectedRequest.requestNumber}`;
      const descriptionEn =
        String(fields.get("descriptionEn") ?? "").trim() ||
        `Price quote for ${selectedRequest.requestNumber}`;
      const form = new URLSearchParams({
        csrfToken,
        requestId: selectedRequest.id,
        expectedRequestVersion: String(selectedRequest.version),
        amountMinor: String(amountMinor),
        currency,
        descriptionAr,
        descriptionEn,
        expiresAt: expiresAt.toISOString(),
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

  async function createRequestOnBehalf(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (csrfToken === undefined || interactionLocked || conversation === undefined) return;
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const serviceId = String(fields.get("serviceId") ?? "");
    const title = String(fields.get("title") ?? "").trim();
    if (serviceId.length === 0 || title.length < 3) {
      setNotice(
        english ? "Pick a service and write a short title." : "اختر خدمة واكتب عنوانًا قصيرًا.",
      );
      return;
    }
    setPending(true);
    setNotice(english ? "Creating the request…" : "جارٍ إنشاء الطلب…");
    try {
      const body = new URLSearchParams({
        csrfToken,
        locale,
        studentUserId: conversation.studentUserId,
        serviceId,
        submissionKey: crypto.randomUUID(),
        title,
        description: english
          ? `${title} — created by the ITQANAK team; details in the chat.`
          : `${title} — أنشأه فريق إتقانك، والتفاصيل في المحادثة.`,
        submitImmediately: "true",
      });
      const response = await fetch("/api/admin/requests", {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      formElement.reset();
      setNotice(
        english ? "Request created and assigned to the student." : "تم إنشاء الطلب وإسناده للطالب.",
      );
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The request could not be created." : "تعذر إنشاء الطلب.");
    } finally {
      setPending(false);
    }
  }

  // Student one-tap request from inside the chat: pick a service, type a title,
  // it is created and submitted without leaving the conversation.
  async function createRequestAsStudent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (csrfToken === undefined || interactionLocked) return;
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const serviceId = String(fields.get("serviceId") ?? "");
    const title = String(fields.get("title") ?? "").trim();
    if (serviceId.length === 0 || title.length < 3) {
      setNotice(
        english ? "Pick a service and write a short title." : "اختر خدمة واكتب عنوانًا قصيرًا.",
      );
      return;
    }
    setPending(true);
    setNotice(english ? "Creating the request…" : "جارٍ إنشاء الطلب…");
    try {
      const body = new URLSearchParams({
        csrfToken,
        locale,
        quick: "true",
        intent: "submit",
        acceptedAcademicIntegrity: "true",
        submissionKey: crypto.randomUUID(),
        serviceId,
        title,
      });
      const response = await fetch("/api/student/requests", {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      formElement.reset();
      setNotice(english ? "Request created." : "تم إنشاء الطلب.");
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The request could not be created." : "تعذر إنشاء الطلب.");
    } finally {
      setPending(false);
    }
  }

  // Attach a charge to any (non-draft) request straight onto the student's debt
  // ledger, with no accept/reject step.
  async function addRequestCharge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (csrfToken === undefined || interactionLocked || selectedRequest === undefined) return;
    const formElement = event.currentTarget;
    const fields = new FormData(formElement);
    const amount = String(fields.get("amount") ?? "").trim();
    if (!/^[0-9]+([.][0-9]{1,3})?$/u.test(amount) || Number(amount) <= 0) {
      setNotice(english ? "Enter a valid amount." : "أدخل مبلغًا صحيحًا.");
      return;
    }
    const currencyValue = String(fields.get("currency") ?? "SAR");
    setPending(true);
    setNotice(english ? "Adding to the ledger…" : "جارٍ الإضافة للمديونية…");
    try {
      const body = new URLSearchParams({
        csrfToken,
        locale,
        requestNumber: selectedRequest.requestNumber,
        amount,
        currency: currencyValue === "AED" || currencyValue === "KWD" ? currencyValue : "SAR",
        titleAr: `مبلغ الطلب ${selectedRequest.requestNumber}`,
        titleEn: `Charge for ${selectedRequest.requestNumber}`,
      });
      const response = await fetch("/api/admin/finance", {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      formElement.reset();
      setNotice(english ? "Added to the student's debt ledger." : "أُضيف إلى مديونية الطالب.");
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The charge could not be added." : "تعذر إضافة المبلغ.");
    } finally {
      setPending(false);
    }
  }

  // Admin confirms or rejects a student's payment receipt straight from the
  // conversation card. The server writes the follow-up PAYMENT_REVIEWED message.
  async function reviewReceipt(submissionId: string, decision: "ACCEPT" | "REJECT") {
    if (csrfToken === undefined || interactionLocked || mode !== "admin") return;
    setPending(true);
    setNotice(
      decision === "ACCEPT"
        ? english
          ? "Confirming the payment…"
          : "جارٍ تأكيد الدفع…"
        : english
          ? "Rejecting the receipt…"
          : "جارٍ رفض الإيصال…",
    );
    try {
      const response = await fetch(
        `/api/admin/finance/receipts/${encodeURIComponent(submissionId)}/review`,
        {
          method: "POST",
          body: new URLSearchParams({ csrfToken, decision, locale }),
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
        },
      );
      if (!response.ok) throw new Error();
      setNotice(
        decision === "ACCEPT"
          ? english
            ? "Payment confirmed."
            : "تم تأكيد الدفع."
          : english
            ? "Receipt rejected."
            : "تم رفض الإيصال.",
      );
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The receipt could not be reviewed." : "تعذرت مراجعة الإيصال.");
    } finally {
      setPending(false);
    }
  }

  // Admin: nudge the student about one unpaid due.
  async function remindDue(dueId: string) {
    if (csrfToken === undefined || interactionLocked || mode !== "admin") return;
    setPending(true);
    setNotice(english ? "Sending a reminder…" : "جارٍ إرسال التذكير…");
    try {
      const response = await fetch(`/api/admin/finance/${encodeURIComponent(dueId)}`, {
        method: "POST",
        body: new URLSearchParams({ csrfToken, locale, action: "remind" }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      setNotice(english ? "Reminder sent." : "تم إرسال التذكير.");
      messagePokeRef.current();
    } catch {
      setNotice(english ? "The reminder could not be sent." : "تعذر إرسال التذكير.");
    } finally {
      setPending(false);
    }
  }

  // Admin: send the student one consolidated invoice for every unpaid due.
  async function sendInvoice() {
    if (
      csrfToken === undefined ||
      interactionLocked ||
      mode !== "admin" ||
      conversation === undefined
    )
      return;
    setPending(true);
    setNotice(english ? "Sending the invoice…" : "جارٍ إرسال الفاتورة…");
    try {
      const response = await fetch(
        `/api/admin/finance/students/${encodeURIComponent(conversation.studentUserId)}/invoice`,
        {
          method: "POST",
          body: new URLSearchParams({ csrfToken, locale }),
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
        },
      );
      const result = (await response.json().catch(() => ({}))) as { count?: number };
      if (!response.ok) throw new Error();
      setNotice(
        (result.count ?? 0) === 0
          ? english
            ? "No unpaid dues to invoice."
            : "لا توجد مستحقات غير مدفوعة."
          : english
            ? "Invoice sent to the student."
            : "تم إرسال الفاتورة إلى الطالب.",
      );
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The invoice could not be sent." : "تعذر إرسال الفاتورة.");
    } finally {
      setPending(false);
    }
  }

  // Admin marks a request's due as paid without waiting for a student receipt.
  async function markRequestPaid(
    dueId: string,
    expectedVersion: number,
    method: string,
    reference: string,
  ) {
    if (csrfToken === undefined || interactionLocked || mode !== "admin") return;
    setPending(true);
    setNotice(english ? "Recording the payment…" : "جارٍ تسجيل الدفع…");
    try {
      const response = await fetch(`/api/admin/finance/${encodeURIComponent(dueId)}`, {
        method: "POST",
        body: new URLSearchParams({
          csrfToken,
          locale,
          action: "record-payment",
          expectedVersion: String(expectedVersion),
          method,
          reference: reference.trim().length >= 2 ? reference.trim() : "تأكيد يدوي من الإدارة",
        }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      setNotice(english ? "Marked as paid." : "تم وضعه كمدفوع.");
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(english ? "The payment could not be recorded." : "تعذر تسجيل الدفع.");
    } finally {
      setPending(false);
    }
  }

  // Admin records a partial payment: the due is split into a paid part + a new
  // due for the remaining balance (no schema change; the ledger stays exact).
  async function recordSplitPayment(
    dueId: string,
    paidAmount: string,
    method: string,
    reference: string,
  ) {
    if (csrfToken === undefined || interactionLocked || mode !== "admin") return;
    setPending(true);
    setNotice(english ? "Recording the partial payment…" : "جارٍ تسجيل الدفعة الجزئية…");
    try {
      const response = await fetch(`/api/admin/finance/${encodeURIComponent(dueId)}`, {
        method: "POST",
        body: new URLSearchParams({
          csrfToken,
          locale,
          action: "split-payment",
          paidAmount: paidAmount.trim(),
          method,
          reference: reference.trim().length >= 2 ? reference.trim() : "دفعة جزئية بتأكيد الإدارة",
        }),
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
      });
      if (!response.ok) throw new Error();
      setNotice(
        english
          ? "Partial payment recorded; a due for the balance was created."
          : "سُجّلت الدفعة الجزئية وأُنشئ مستحق بالمبلغ المتبقّي.",
      );
      messagePokeRef.current();
      contactPokeRef.current();
    } catch {
      setNotice(
        english ? "The partial payment could not be recorded." : "تعذر تسجيل الدفعة الجزئية.",
      );
    } finally {
      setPending(false);
    }
  }

  // Attach a price to one request straight onto the ledger (used by the bulk pricer).
  async function chargeOneRequest(
    requestNumber: string,
    amount: string,
    currency: string,
  ): Promise<boolean> {
    if (csrfToken === undefined) return false;
    const response = await fetch("/api/admin/finance", {
      method: "POST",
      body: new URLSearchParams({
        csrfToken,
        locale,
        requestNumber,
        amount: amount.trim(),
        currency,
        titleAr: `مبلغ الطلب ${requestNumber}`,
        titleEn: `Charge for ${requestNumber}`,
      }),
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    });
    return response.ok;
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
      <div className="flex h-full min-h-0 flex-col bg-[var(--itq-color-surface)]">
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
        <div className="itq-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          {mode === "admin" ? (
            <div className="mb-3 grid gap-2">
              <button
                className="w-full rounded-xl border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-surface)] px-3 py-2 text-xs font-black text-[var(--itq-color-brand-strong)] disabled:opacity-50"
                disabled={interactionLocked || csrfToken === undefined}
                onClick={() => void sendInvoice()}
                type="button"
              >
                {english ? "Send an invoice for all unpaid dues" : "أرسل فاتورة بكل المستحقات"}
              </button>
              {(() => {
                const unpriced = requests.filter(
                  (request) => request.status !== "DRAFT" && request.finance?.hasDue !== true,
                );
                return unpriced.length === 0 ? null : (
                  <details className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]">
                    <summary className="cursor-pointer list-none px-3 py-2 text-xs font-black text-[var(--itq-color-muted)]">
                      {english
                        ? `Price ${unpriced.length} un-priced request(s)`
                        : `تسعير ${unpriced.length} طلب غير مسعّر`}
                    </summary>
                    <div className="px-3 pb-3">
                      <BulkPricePanel
                        english={english}
                        locked={interactionLocked}
                        onCharge={chargeOneRequest}
                        onInvoice={sendInvoice}
                        requests={unpriced}
                      />
                    </div>
                  </details>
                );
              })()}
            </div>
          ) : null}
          {services.length > 0 ? (
            <form
              className="mb-3 rounded-2xl border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] p-3"
              onSubmit={(event) =>
                void (mode === "admin"
                  ? createRequestOnBehalf(event)
                  : createRequestAsStudent(event))
              }
            >
              <p className="mb-2 text-xs font-black text-[var(--itq-color-brand-strong)]">
                {mode === "admin"
                  ? english
                    ? "Create a request for this student"
                    : "إنشاء طلب لهذا الطالب"
                  : english
                    ? "New request"
                    : "طلب جديد"}
              </p>
              <select
                aria-label={english ? "Service" : "الخدمة"}
                className="h-10 w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
                defaultValue=""
                name="serviceId"
                required
              >
                <option disabled value="">
                  {english ? "Choose a service" : "اختر الخدمة"}
                </option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
              <div className="mt-2 flex items-stretch gap-2">
                <input
                  aria-label={english ? "Title" : "العنوان"}
                  className="h-10 min-w-0 flex-1 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 text-sm"
                  dir="auto"
                  maxLength={160}
                  name="title"
                  placeholder={english ? "Request title" : "عنوان الطلب"}
                  required
                />
                <button
                  className="min-h-10 shrink-0 rounded-xl bg-[var(--itq-color-brand-700)] px-3 text-xs font-black text-white disabled:opacity-50"
                  disabled={interactionLocked}
                  type="submit"
                >
                  {mode === "admin"
                    ? english
                      ? "Create & assign"
                      : "إنشاء وإسناد"
                    : english
                      ? "Create"
                      : "إنشاء"}
                </button>
              </div>
            </form>
          ) : null}
          {requests.length === 0 ? (
            <div className="rounded-2xl bg-[var(--itq-color-surface-soft)] p-5 text-center">
              <RequestsIcon className="mx-auto size-8 text-[var(--itq-color-muted)]" />
              <p className="mt-3 text-sm font-black">
                {english ? "No requests yet" : "لا توجد طلبات بعد"}
              </p>
              {mode === "student" ? (
                <Link
                  className="mt-3 inline-block text-xs font-black text-[var(--itq-color-brand-strong)] underline"
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
                const cardExpanded = mode === "admin" && expandedRequestId === request.id;
                const cardHasPendingQuote = hasPendingQuoteForRequest(messages, request.id);
                const cardPriced =
                  hasAnyQuoteForRequest(messages, request.id) ||
                  request.status === "QUOTED" ||
                  request.finance?.hasDue === true;
                const cardPaid = request.finance?.dueStatus === "PAID";
                const canQuoteCard =
                  !cardPaid &&
                  quoteEligibleRequestStatuses.has(request.status) &&
                  !cardHasPendingQuote;
                const canChargeCard = !cardPaid && request.status !== "DRAFT";
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
                      <span className="mt-2 flex flex-wrap items-center gap-1.5">
                        <RequestStatusChip locale={locale} status={request.status} />
                        {financeChips(request.finance, english, mode, cardPriced).map((chip) => (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[9px] font-black ${chip.className}`}
                            key={chip.key}
                          >
                            {chip.label}
                          </span>
                        ))}
                      </span>
                    </button>
                    <Link
                      className="mt-3 flex min-h-9 items-center justify-center rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 text-xs font-black no-underline"
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
                    {mode === "admin" && cardPaid ? (
                      <p className="mt-2 rounded-xl border border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] px-3 py-2 text-[11px] font-black text-[var(--itq-color-success-900)]">
                        {english ? "Paid in full ✓" : "تم السداد بالكامل ✓"}
                      </p>
                    ) : null}
                    {mode === "admin" &&
                    request.finance?.dueStatus === "UNPAID" &&
                    request.finance.dueId !== undefined ? (
                      <details className="mt-2 rounded-xl border border-[var(--itq-color-success-200)] bg-[var(--itq-color-success-50)] p-2">
                        <summary className="cursor-pointer list-none text-[11px] font-black text-[var(--itq-color-success-900)]">
                          {english ? "Mark as paid" : "وضع كـ مدفوع"}
                        </summary>
                        <form
                          className="mt-2 grid gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void markRequestPaid(
                              request.finance?.dueId ?? "",
                              request.finance?.dueVersion ?? 1,
                              String(data.get("method") ?? "BANK_TRANSFER"),
                              String(data.get("reference") ?? ""),
                            );
                          }}
                        >
                          <select
                            aria-label={english ? "Payment method" : "وسيلة الدفع"}
                            className="h-9 rounded-lg border border-[var(--itq-color-success-200)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
                            defaultValue="BANK_TRANSFER"
                            name="method"
                          >
                            <option value="BANK_TRANSFER">
                              {english ? "Bank transfer" : "تحويل بنكي"}
                            </option>
                            <option value="CASH">{english ? "Cash" : "نقدًا"}</option>
                            <option value="OTHER">{english ? "Other" : "أخرى"}</option>
                          </select>
                          <input
                            className="h-9 rounded-lg border border-[var(--itq-color-success-200)] bg-[var(--itq-color-surface)] px-2 text-xs"
                            maxLength={120}
                            name="reference"
                            placeholder={english ? "Reference / note" : "المرجع أو ملاحظة"}
                          />
                          <button
                            className="h-9 rounded-lg bg-[var(--itq-color-success-600)] px-3 text-xs font-black text-white disabled:opacity-50"
                            disabled={interactionLocked}
                            type="submit"
                          >
                            {english ? "Confirm payment" : "تأكيد الدفع"}
                          </button>
                        </form>
                      </details>
                    ) : null}
                    {mode === "admin" &&
                    request.finance?.dueStatus === "UNPAID" &&
                    request.finance.dueId !== undefined ? (
                      <details className="mt-2 rounded-xl border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] p-2">
                        <summary className="cursor-pointer list-none text-[11px] font-black text-[var(--itq-color-warning-950)]">
                          {english ? "Record a partial payment" : "تسجيل دفعة جزئية"}
                        </summary>
                        <p className="mt-1 text-[10px] font-bold text-[var(--itq-color-warning-900)]">
                          {english
                            ? `Due total: ${(
                                (request.finance.dueAmountMinor ?? 0) /
                                10 ** (request.finance.dueMinorUnit ?? 2)
                              ).toFixed(request.finance.dueMinorUnit ?? 2)} ${
                                request.finance.dueCurrency ?? ""
                              }. The rest becomes a new due.`
                            : `إجمالي المستحق: ${(
                                (request.finance.dueAmountMinor ?? 0) /
                                10 ** (request.finance.dueMinorUnit ?? 2)
                              ).toFixed(request.finance.dueMinorUnit ?? 2)} ${
                                request.finance.dueCurrency ?? ""
                              }. يُنشأ مستحق جديد بالمتبقّي.`}
                        </p>
                        <form
                          className="mt-2 grid gap-2"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const data = new FormData(event.currentTarget);
                            void recordSplitPayment(
                              request.finance?.dueId ?? "",
                              String(data.get("paidAmount") ?? ""),
                              String(data.get("method") ?? "BANK_TRANSFER"),
                              String(data.get("reference") ?? ""),
                            );
                          }}
                        >
                          <input
                            className="h-9 rounded-lg border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
                            inputMode="decimal"
                            maxLength={12}
                            name="paidAmount"
                            placeholder={english ? "Amount paid now" : "المبلغ المدفوع الآن"}
                            required
                          />
                          <select
                            aria-label={english ? "Payment method" : "وسيلة الدفع"}
                            className="h-9 rounded-lg border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
                            defaultValue="BANK_TRANSFER"
                            name="method"
                          >
                            <option value="BANK_TRANSFER">
                              {english ? "Bank transfer" : "تحويل بنكي"}
                            </option>
                            <option value="CASH">{english ? "Cash" : "نقدًا"}</option>
                            <option value="OTHER">{english ? "Other" : "أخرى"}</option>
                          </select>
                          <input
                            className="h-9 rounded-lg border border-[var(--itq-color-warning-200)] bg-[var(--itq-color-surface)] px-2 text-xs"
                            maxLength={120}
                            name="reference"
                            placeholder={english ? "Reference / note" : "المرجع أو ملاحظة"}
                          />
                          <button
                            className="h-9 rounded-lg bg-[var(--itq-color-warning-800)] px-3 text-xs font-black text-white disabled:opacity-50"
                            disabled={interactionLocked}
                            type="submit"
                          >
                            {english ? "Record partial payment" : "تسجيل الدفعة الجزئية"}
                          </button>
                        </form>
                      </details>
                    ) : null}
                    {mode === "admin" &&
                    !cardPaid &&
                    (canQuoteCard || canChargeCard || cardHasPendingQuote) ? (
                      <>
                        <button
                          aria-expanded={cardExpanded}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-[var(--itq-color-surface-soft)] px-3 py-2 text-[11px] font-black text-[var(--itq-color-muted)]"
                          onClick={() => {
                            setExpandedRequestId(cardExpanded ? undefined : request.id);
                            if (!cardExpanded) setLinkedRequestId(request.id);
                          }}
                          type="button"
                        >
                          {cardExpanded
                            ? english
                              ? "Hide pricing"
                              : "إخفاء التسعير"
                            : english
                              ? "Pricing & ledger"
                              : "التسعير والمديونية"}
                          <ChevronIcon
                            className={`size-3.5 transition ${
                              cardExpanded ? "-rotate-90" : "rotate-90"
                            }`}
                          />
                        </button>
                        {cardExpanded ? (
                          <div className="mt-2 grid gap-2 border-t border-[var(--itq-color-border)] pt-2">
                            <p className="text-[10px] font-bold text-[var(--itq-color-muted)]">
                              {english ? "Updated " : "آخر تحديث "}
                              <time dateTime={request.updatedAt.toISOString()}>
                                {formatMessageDate(request.updatedAt, locale)}
                              </time>
                            </p>
                            {canQuoteCard || canChargeCard ? (
                              <PricingForm
                                allowCharge={canChargeCard}
                                allowQuote={canQuoteCard}
                                english={english}
                                locked={interactionLocked}
                                onCharge={(event) => void addRequestCharge(event)}
                                onQuote={(event) => void createQuote(event)}
                              />
                            ) : null}
                            {cardHasPendingQuote && !canQuoteCard ? (
                              <p className="rounded-xl bg-[var(--itq-color-info-50)] px-3 py-2 text-[10px] font-bold text-[var(--itq-color-info-950)]">
                                {english
                                  ? "A price card is already awaiting the student's response."
                                  : "توجد بطاقة سعر بانتظار رد الطالب بالفعل."}
                              </p>
                            ) : null}
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {mode === "admin" && selected && adminTransitions.length > 0 ? (
                      <form
                        className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-[var(--itq-color-border)] pt-2"
                        onSubmit={(event) => void transitionAdminRequest(event, request)}
                      >
                        <label className="sr-only" htmlFor={`quick-status-${request.id}`}>
                          {english ? "New request status" : "حالة الطلب الجديدة"}
                        </label>
                        <select
                          className="h-10 min-w-0 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2 text-xs font-black"
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
                          className="min-h-10 rounded-xl bg-[var(--itq-color-ink-deep)] px-3 text-xs font-black text-white disabled:opacity-50"
                          disabled={interactionLocked}
                          type="submit"
                        >
                          {english ? "Save" : "حفظ"}
                        </button>
                      </form>
                    ) : null}
                    {mode === "student" && selected && request.status === "WAITING_FOR_STUDENT" ? (
                      <button
                        className="mt-2 min-h-10 w-full rounded-xl bg-[var(--itq-color-warning-800)] px-3 text-xs font-black text-white disabled:opacity-50"
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
                          className="min-h-10 rounded-xl border border-[var(--itq-color-success-200)] bg-[var(--itq-color-surface)] px-2 text-xs font-black text-[var(--itq-color-success-900)] disabled:opacity-50"
                          disabled={interactionLocked}
                          onClick={() =>
                            void transitionStudentRequest(request, "REVISION_REQUESTED")
                          }
                          type="button"
                        >
                          {english ? "Request revision" : "طلب تعديل"}
                        </button>
                        <button
                          className="min-h-10 rounded-xl bg-[var(--itq-color-success-600)] px-2 text-xs font-black text-white disabled:opacity-50"
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
        </div>
      </div>
    );

  if (mode === "admin" && conversation === undefined) {
    return (
      <section
        aria-label={english ? "Unified conversation center" : "مركز المحادثات الموحد"}
        className="relative grid h-full overflow-hidden bg-[var(--itq-color-surface)] lg:grid-cols-[22rem_minmax(0,1fr)]"
      >
        <aside className="flex min-h-0 flex-col border-e border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)]">
          <ConversationList
            conversations={contactItems}
            locale={locale}
            {...(search === undefined ? {} : { search })}
          />
        </aside>
        <main className="hidden place-items-center bg-[var(--itq-color-surface-soft)] p-8 text-center lg:grid">
          <div className="max-w-sm">
            <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-sm">
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
      className={`relative grid h-full min-h-0 overflow-hidden border-x border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] ${
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
            className={`fixed inset-y-0 start-0 z-50 flex w-[min(88vw,22rem)] min-h-0 flex-col border-e border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] shadow-2xl transition-[transform,visibility] lg:static lg:z-auto lg:w-auto lg:visible lg:translate-x-0 lg:shadow-none ${
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

      <main className="flex min-h-0 min-w-0 flex-col bg-[var(--itq-color-surface-soft)]">
        <header className="flex h-[4.65rem] shrink-0 items-center justify-between gap-3 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 sm:px-5">
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
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--itq-color-ink-deep)] text-sm font-black text-white">
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
                      ? "ITQANAK administration"
                      : "إدارة إتقانك"}
                </bdi>
              </h1>
              {mode === "admin" ? (
                <p
                  className={`flex items-center gap-1.5 truncate text-[10px] font-bold sm:text-xs ${
                    studentOnline
                      ? "text-[var(--itq-color-success-700)]"
                      : "text-[var(--itq-color-muted)]"
                  }`}
                >
                  <span
                    className={`size-2 rounded-full ${
                      studentOnline
                        ? "bg-[var(--itq-color-success-500)]"
                        : "bg-[var(--itq-color-border-strong)]"
                    }`}
                  />
                  {studentOnline ? (english ? "Online now" : "متصل الآن") : studentLastSeenLabel}
                </p>
              ) : (
                <p className="flex items-center gap-1.5 truncate text-[10px] font-bold text-[var(--itq-color-success-700)] sm:text-xs">
                  <span className="size-2 rounded-full bg-[var(--itq-color-success-500)]" />
                  {english ? "Private unified conversation" : "محادثة موحدة وخاصة"}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full bg-[var(--itq-color-success-50)] px-3 py-1.5 text-[10px] font-black text-[var(--itq-color-success-800)] sm:inline-flex">
              <ShieldCheckIcon className="size-3.5" /> {english ? "Secure" : "آمنة"}
            </span>
            <button
              aria-expanded={searchOpen}
              aria-label={english ? "Search this conversation" : "البحث في المحادثة"}
              className={`grid size-10 place-items-center rounded-xl border border-[var(--itq-color-border)] hover:bg-[var(--itq-color-brand-50)] ${
                searchOpen
                  ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                  : ""
              }`}
              onClick={() => {
                setSearchOpen((value) => !value);
                if (searchOpen) setSearchTerm("");
              }}
              type="button"
            >
              <SearchIcon className="size-5" />
            </button>
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

        {searchOpen ? (
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-3 py-2 sm:px-5">
            <div className="relative flex-1">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--itq-color-muted)]" />
              <input
                className="w-full rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] py-2 pe-3 ps-9 text-sm outline-none focus:border-[var(--itq-color-brand-500)] focus:ring-2 focus:ring-[var(--itq-color-brand-100)]"
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    jumpToMatch(activeMatch + (event.shiftKey ? -1 : 1));
                  } else if (event.key === "Escape") {
                    setSearchOpen(false);
                    setSearchTerm("");
                  }
                }}
                placeholder={english ? "Search messages…" : "ابحث في الرسائل…"}
                ref={searchInputRef}
                type="search"
                value={searchTerm}
              />
            </div>
            <span className="min-w-14 text-center text-xs font-bold tabular-nums text-[var(--itq-color-muted)]">
              {normalizedSearch.length < 2
                ? ""
                : searchMatches.length === 0
                  ? english
                    ? "None"
                    : "لا شيء"
                  : `${activeMatch + 1}/${searchMatches.length}`}
            </span>
            <button
              aria-label={english ? "Previous match" : "النتيجة السابقة"}
              className="grid size-9 place-items-center rounded-lg border border-[var(--itq-color-border)] disabled:opacity-40"
              disabled={searchMatches.length === 0}
              onClick={() => jumpToMatch(activeMatch - 1)}
              type="button"
            >
              <ChevronIcon className="size-4 -rotate-90" />
            </button>
            <button
              aria-label={english ? "Next match" : "النتيجة التالية"}
              className="grid size-9 place-items-center rounded-lg border border-[var(--itq-color-border)] disabled:opacity-40"
              disabled={searchMatches.length === 0}
              onClick={() => jumpToMatch(activeMatch + 1)}
              type="button"
            >
              <ChevronIcon className="size-4 rotate-90" />
            </button>
          </div>
        ) : null}

        {selectedRequest === undefined ? null : (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]/90 px-4 py-2 text-xs">
            <button
              aria-controls={detailsPanelId}
              className="flex min-w-0 items-center gap-2 text-start"
              onClick={() => {
                closeContacts(false);
                setDetailsOpen(true);
              }}
              type="button"
            >
              <span className="shrink-0 font-black text-[var(--itq-color-brand-strong)]">
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
                className="grid size-7 place-items-center rounded-lg text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-danger-50)] hover:text-[var(--itq-color-danger-700)]"
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
          className="itq-chat-bg itq-scroll relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-6"
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
              className="mx-auto mb-5 block rounded-full border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-4 py-2 text-xs font-black shadow-sm disabled:opacity-60"
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
                <span className="mx-auto grid size-20 place-items-center rounded-full bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-sm">
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
                if (system && message.quote === undefined && !isImportantSystemMessage(message)) {
                  return null;
                }
                return (
                  <Fragment key={message.id}>
                    {showDate ? (
                      <li className="sticky top-2 z-10 mx-auto my-2 rounded-full border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]/90 px-3 py-1 text-[10px] font-black text-[var(--itq-color-muted)] shadow-sm backdrop-blur">
                        <time dateTime={message.sentAt.toISOString()}>
                          {formatMessageDate(message.sentAt, locale)}
                        </time>
                      </li>
                    ) : null}
                    {message.quote !== undefined ? (
                      <li className="my-2">
                        {message.request === undefined ? null : (
                          <Link
                            className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-full bg-[var(--itq-color-surface)]/90 px-3 py-1 text-[10px] font-black text-[var(--itq-color-brand-strong)] no-underline shadow-sm"
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
                          optimisticDecision={quoteDecisions.get(message.quote.id)}
                          pending={interactionLocked}
                          quote={message.quote}
                        />
                      </li>
                    ) : system ? (
                      message.body === "PAYMENT_DUE_CREATED" ? (
                        <li className="mx-auto my-2 w-full max-w-sm">
                          <PaymentDueCard
                            csrfToken={csrfToken}
                            duePaid={
                              requests.find(
                                (candidate) =>
                                  candidate.id === message.request?.id ||
                                  candidate.requestNumber === message.metadata.requestNumber,
                              )?.finance?.dueStatus === "PAID"
                            }
                            locale={locale}
                            metadata={message.metadata}
                            mode={mode}
                            onRemind={(dueId) => void remindDue(dueId)}
                            onSubmitted={() => {
                              messagePokeRef.current();
                              contactPokeRef.current();
                            }}
                            reminderBusy={interactionLocked}
                            receiptUnderReview={
                              requests.find(
                                (candidate) =>
                                  candidate.id === message.request?.id ||
                                  candidate.requestNumber === message.metadata.requestNumber,
                              )?.finance?.hasPendingReceipt === true
                            }
                          />
                        </li>
                      ) : message.body === "PAYMENT_RECEIPT_SUBMITTED" ? (
                        <li className="mx-auto my-2 w-full max-w-sm">
                          <PaymentReceiptCard
                            busy={interactionLocked}
                            csrfToken={csrfToken}
                            locale={locale}
                            metadata={message.metadata}
                            mode={mode}
                            onImage={(source, name) =>
                              setLightbox({ download: source, name, src: source })
                            }
                            onReview={(submissionId, decision) =>
                              void reviewReceipt(submissionId, decision)
                            }
                            reviewState={(() => {
                              const finance = requests.find(
                                (candidate) =>
                                  candidate.id === message.request?.id ||
                                  candidate.requestNumber === message.metadata.requestNumber,
                              )?.finance;
                              if (finance?.hasPendingReceipt === true) return "PENDING";
                              if (finance?.dueStatus === "PAID") return "ACCEPTED";
                              return "REJECTED";
                            })()}
                          />
                        </li>
                      ) : message.body === "INVOICE_SUMMARY" ? (
                        <li className="mx-auto my-2 w-full max-w-sm">
                          <InvoiceSummaryCard locale={locale} metadata={message.metadata} />
                        </li>
                      ) : isImportantSystemMessage(message) ? (
                        <li className="mx-auto my-1 flex max-w-md items-center gap-1.5 rounded-full bg-[var(--itq-color-surface)]/85 px-3 py-1 text-[10px] font-bold text-[var(--itq-color-muted)] shadow-sm">
                          <bdi className="truncate" dir="auto">
                            {systemMessageLabel(message, locale)}
                          </bdi>
                          <time
                            className="shrink-0 opacity-70"
                            dateTime={message.sentAt.toISOString()}
                          >
                            {formatMessageTime(message.sentAt, locale)}
                          </time>
                        </li>
                      ) : null
                    ) : (
                      <li
                        className={`flex ${mine ? "justify-end" : "justify-start"}`}
                        data-mid={message.id}
                      >
                        <article
                          {...(message.deletedAt === undefined && editingId !== message.id
                            ? bubbleHoldHandlers(message.id)
                            : {})}
                          className={`max-w-[85%] rounded-xl px-2.5 py-1.5 shadow-sm transition sm:max-w-[75%] ${
                            mine
                              ? "rounded-ee-sm bg-[var(--itq-color-bubble-out)] text-[var(--itq-color-bubble-out-ink)]"
                              : "rounded-es-sm bg-[var(--itq-color-bubble-in)] text-[var(--itq-color-bubble-in-ink)]"
                          } ${
                            highlightId === message.id
                              ? "ring-2 ring-[var(--itq-color-warning-500)] ring-offset-2 ring-offset-[var(--itq-color-surface-soft)]"
                              : ""
                          }`}
                        >
                          {!mine ? (
                            <p className="mb-1 text-[10px] font-black text-[var(--itq-color-brand-strong)]">
                              <bdi dir="auto">
                                {mode === "admin"
                                  ? (message.senderDisplayName ?? conversation?.studentDisplayName)
                                  : english
                                    ? "ITQANAK administration"
                                    : "إدارة إتقانك"}
                              </bdi>
                            </p>
                          ) : null}
                          {message.request === undefined ? null : (
                            <button
                              className={`mb-2 flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black ${
                                mine
                                  ? "bg-black/5 text-[var(--itq-color-bubble-meta)]"
                                  : "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
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
                          {message.replyTo === undefined ? null : (
                            <button
                              className={`mb-1.5 block w-full max-w-full rounded-lg border-s-2 px-2 py-1 text-start text-[11px] leading-5 ${
                                mine
                                  ? "border-[var(--itq-color-brand-400)] bg-black/[0.04] text-[var(--itq-color-bubble-meta)]"
                                  : "border-[var(--itq-color-brand-400)] bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-muted)]"
                              }`}
                              onClick={() => {
                                if (message.replyTo !== undefined)
                                  scrollToMessage(message.replyTo.id);
                              }}
                              type="button"
                            >
                              <span className="block truncate" dir="auto">
                                {message.replyTo.deleted
                                  ? english
                                    ? "Deleted message"
                                    : "رسالة محذوفة"
                                  : message.replyTo.contentType === "TEXT"
                                    ? message.replyTo.body
                                    : english
                                      ? "Attachment"
                                      : "مرفق"}
                              </span>
                            </button>
                          )}
                          {message.attachment === undefined || apiBase === undefined ? null : (
                            <AttachmentBody
                              apiBase={apiBase}
                              attachment={message.attachment}
                              contentType={message.contentType}
                              locale={locale}
                              messageId={message.id}
                              onOpenImage={setLightbox}
                            />
                          )}
                          {message.deletedAt !== undefined ? (
                            <p
                              className={`flex items-center gap-1.5 text-sm italic leading-7 ${"text-[var(--itq-color-bubble-meta)]"}`}
                            >
                              <CloseIcon className="size-3.5 shrink-0" />
                              {english ? "This message was deleted" : "تم حذف هذه الرسالة"}
                            </p>
                          ) : editingId === message.id ? (
                            <div className="grid gap-1.5">
                              <textarea
                                aria-label={english ? "Edit message" : "تعديل الرسالة"}
                                autoFocus
                                className="min-h-16 w-full resize-none rounded-lg border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2.5 py-1.5 text-sm leading-6 text-[var(--itq-color-ink)] outline-none"
                                dir="auto"
                                maxLength={10_000}
                                onChange={(event) => setEditingText(event.currentTarget.value)}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" && !event.shiftKey) {
                                    event.preventDefault();
                                    void submitEdit(message.id);
                                  }
                                  if (event.key === "Escape") setEditingId(undefined);
                                }}
                                value={editingText}
                              />
                              <div className="flex justify-end gap-1.5 text-[10px] font-black">
                                <button
                                  className={`rounded px-2 py-0.5 ${"hover:bg-black/5"}`}
                                  onClick={() => setEditingId(undefined)}
                                  type="button"
                                >
                                  {english ? "Cancel" : "إلغاء"}
                                </button>
                                <button
                                  className="rounded bg-[var(--itq-color-surface)] px-2 py-0.5 text-[var(--itq-color-brand-strong)] disabled:opacity-50"
                                  disabled={editingText.trim().length === 0}
                                  onClick={() => void submitEdit(message.id)}
                                  type="button"
                                >
                                  {english ? "Save" : "حفظ"}
                                </button>
                              </div>
                            </div>
                          ) : message.contentType === "TEXT" ? (
                            <p className="whitespace-pre-wrap break-words text-sm leading-7">
                              <bdi dir="auto">{message.body}</bdi>
                            </p>
                          ) : null}
                          {(message.reactions?.length ?? 0) > 0 &&
                          message.deletedAt === undefined ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {message.reactions?.map((reaction) => (
                                <button
                                  className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${
                                    reaction.mine
                                      ? "border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-100)] text-[var(--itq-color-brand-strong)]"
                                      : "border border-black/5 bg-[var(--itq-color-surface)] text-[var(--itq-color-bubble-meta)]"
                                  }`}
                                  key={reaction.emoji}
                                  onClick={() => void toggleReaction(message.id, reaction.emoji)}
                                  type="button"
                                >
                                  <span>{reaction.emoji}</span>
                                  <span>{reaction.count}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <footer
                            className={`mt-1.5 flex flex-wrap items-center justify-end gap-1.5 text-[10px] font-semibold ${"text-[var(--itq-color-bubble-meta)]"}`}
                          >
                            <span className="me-auto flex items-center gap-1">
                              {message.deletedAt !== undefined ||
                              editingId === message.id ? null : (
                                <>
                                  <button
                                    className={`rounded-md px-2 py-1 font-black ${"hover:bg-black/5"}`}
                                    onClick={() =>
                                      setReplyingTo({
                                        id: message.id,
                                        body:
                                          message.contentType === "TEXT"
                                            ? message.body
                                            : english
                                              ? "Attachment"
                                              : "مرفق",
                                        senderType: message.senderType,
                                      })
                                    }
                                    type="button"
                                  >
                                    {english ? "Reply" : "رد"}
                                  </button>
                                  <span className="relative" data-chat-menu>
                                    <button
                                      aria-label={english ? "Add a reaction" : "أضف تفاعلًا"}
                                      className={`rounded-md px-2 py-1 font-black ${"hover:bg-black/5"}`}
                                      onClick={() => {
                                        setReactionPickerFull(false);
                                        setReactionPickerFor((value) =>
                                          value === message.id ? undefined : message.id,
                                        );
                                      }}
                                      type="button"
                                    >
                                      {english ? "React" : "تفاعل"}
                                    </button>
                                    {reactionPickerFor === message.id ? (
                                      <span
                                        className={`absolute bottom-full z-20 mb-1 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-1.5 shadow-xl ${
                                          mine ? "end-0" : "start-0"
                                        } ${reactionPickerFull ? "grid w-[16rem] max-h-52 grid-cols-8 gap-0.5 overflow-y-auto" : "flex items-center gap-0.5"}`}
                                        data-chat-menu
                                      >
                                        {(reactionPickerFull ? chatEmoji : reactionChoices).map(
                                          (emoji) => (
                                            <button
                                              className="grid size-8 place-items-center rounded-full text-xl hover:bg-[var(--itq-color-surface-soft)] active:scale-90"
                                              key={emoji}
                                              onClick={() => {
                                                void toggleReaction(message.id, emoji);
                                                setReactionPickerFor(undefined);
                                                setReactionPickerFull(false);
                                              }}
                                              type="button"
                                            >
                                              {emoji}
                                            </button>
                                          ),
                                        )}
                                        {reactionPickerFull ? null : (
                                          <button
                                            aria-label={english ? "More emoji" : "المزيد"}
                                            className="grid size-8 place-items-center rounded-full text-lg font-black text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)]"
                                            onClick={() => setReactionPickerFull(true)}
                                            type="button"
                                          >
                                            +
                                          </button>
                                        )}
                                      </span>
                                    ) : null}
                                  </span>
                                  {mine || mode === "admin" ? (
                                    deleteConfirmFor === message.id ? (
                                      <>
                                        <span className="font-black">
                                          {english ? "Delete?" : "حذف؟"}
                                        </span>
                                        <button
                                          className="rounded-md px-2 py-1 font-black text-[var(--itq-color-danger-700)] hover:bg-black/5"
                                          onClick={() => void deleteMessage(message.id)}
                                          type="button"
                                        >
                                          {english ? "Yes" : "نعم"}
                                        </button>
                                        <button
                                          className={`rounded-md px-2 py-1 font-black ${"hover:bg-black/5"}`}
                                          onClick={() => setDeleteConfirmFor(undefined)}
                                          type="button"
                                        >
                                          {english ? "No" : "لا"}
                                        </button>
                                      </>
                                    ) : (
                                      <>
                                        {mine &&
                                        message.contentType === "TEXT" &&
                                        Date.now() - message.sentAt.getTime() < 15 * 60_000 ? (
                                          <button
                                            className={`rounded-md px-2 py-1 font-black ${"hover:bg-black/5"}`}
                                            onClick={() => {
                                              setEditingId(message.id);
                                              setEditingText(message.body);
                                              setDeleteConfirmFor(undefined);
                                            }}
                                            type="button"
                                          >
                                            {english ? "Edit" : "تعديل"}
                                          </button>
                                        ) : null}
                                        <button
                                          className={`rounded-md px-2 py-1 font-black ${"hover:bg-black/5"}`}
                                          onClick={() => setDeleteConfirmFor(message.id)}
                                          type="button"
                                        >
                                          {english ? "Delete" : "حذف"}
                                        </button>
                                      </>
                                    )
                                  ) : null}
                                </>
                              )}
                            </span>
                            {message.editedAt !== undefined && message.deletedAt === undefined ? (
                              <span className="italic">{english ? "edited" : "معدّلة"}</span>
                            ) : null}
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
                  <article className="max-w-[85%] rounded-xl rounded-ee-sm bg-[var(--itq-color-bubble-out)]/80 px-2.5 py-1.5 text-[var(--itq-color-bubble-out-ink)] shadow-sm sm:max-w-[75%]">
                    <p className="whitespace-pre-wrap break-words text-sm leading-7">
                      <bdi dir="auto">{entry.body}</bdi>
                    </p>
                    <footer className="mt-1.5 flex items-center justify-end gap-2 text-[9px] font-semibold text-[var(--itq-color-bubble-meta)]">
                      {entry.status === "failed" ? (
                        <>
                          <span className="text-[var(--itq-color-warning-500)]">
                            {english ? "Not sent" : "لم تُرسل"}
                          </span>
                          <button
                            className="rounded-full bg-black/10 px-2 py-0.5 font-black transition hover:bg-black/20"
                            onClick={() => void deliverText(entry)}
                            type="button"
                          >
                            {english ? "Retry" : "إعادة المحاولة"}
                          </button>
                          <button
                            className="rounded-full px-1.5 py-0.5 font-black text-[var(--itq-color-bubble-meta)] transition hover:opacity-70"
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
                          <span className="size-1.5 animate-pulse rounded-full bg-[var(--itq-color-bubble-meta)]" />
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
              className="sticky bottom-2 mx-auto mt-4 block rounded-full bg-[var(--itq-color-ink-deep)] px-4 py-2 text-xs font-black text-white shadow-xl"
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

        <footer className="itq-safe-b shrink-0 border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-2.5 py-2.5 sm:px-4">
          {notice === undefined ? null : (
            <p
              className="mb-2 rounded-xl bg-[var(--itq-color-surface-soft)] px-3 py-2 text-xs font-bold"
              role="status"
            >
              {notice}
            </p>
          )}
          {recording ? (
            <div className="mb-2 flex items-center justify-between rounded-xl bg-[var(--itq-color-danger-50)] px-3 py-2 text-xs font-black text-[var(--itq-color-danger-800)]">
              <span className="inline-flex items-center gap-2">
                <span className="size-2 animate-pulse rounded-full bg-[var(--itq-color-danger-600)]" />
                {english ? "Recording voice message…" : "جارٍ تسجيل رسالة صوتية…"}
              </span>
              <button className="underline" onClick={() => void toggleRecording()} type="button">
                {english ? "Stop & send" : "إيقاف وإرسال"}
              </button>
            </div>
          ) : null}
          {replyingTo !== undefined ? (
            <div className="mb-2 flex items-start justify-between gap-2 rounded-xl border-s-4 border-[var(--itq-color-brand-500)] bg-[var(--itq-color-surface-soft)] px-3 py-2 text-xs">
              <button
                className="min-w-0 flex-1 text-start"
                onClick={() => scrollToMessage(replyingTo.id)}
                type="button"
              >
                <span className="block font-black text-[var(--itq-color-brand-strong)]">
                  {english ? "Replying to" : "ردًّا على"}{" "}
                  {replyingTo.senderType === "STUDENT"
                    ? mode === "admin"
                      ? english
                        ? "the student"
                        : "الطالب"
                      : english
                        ? "you"
                        : "رسالتك"
                    : replyingTo.senderType === "ADMIN"
                      ? mode === "admin"
                        ? english
                          ? "you"
                          : "رسالتك"
                        : english
                          ? "the team"
                          : "الإدارة"
                      : english
                        ? "a system message"
                        : "رسالة نظام"}
                </span>
                <span className="mt-0.5 block truncate text-[var(--itq-color-muted)]" dir="auto">
                  {replyingTo.body}
                </span>
              </button>
              <button
                aria-label={english ? "Cancel reply" : "إلغاء الرد"}
                className="shrink-0 rounded-lg p-1 text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface)]"
                onClick={() => setReplyingTo(undefined)}
                type="button"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          ) : null}
          {emojiPanelOpen ? (
            <div
              className="mb-2 grid max-h-44 grid-cols-8 gap-0.5 overflow-y-auto rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-2 shadow-sm sm:grid-cols-12"
              data-chat-menu
            >
              {chatEmoji.map((emoji) => (
                <button
                  className="grid size-9 place-items-center rounded-lg text-xl hover:bg-[var(--itq-color-surface-soft)] active:scale-90"
                  key={emoji}
                  onClick={() => {
                    setBody((value) => `${value}${emoji}`);
                    composerRef.current?.focus();
                  }}
                  type="button"
                >
                  {emoji}
                </button>
              ))}
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
            <div className="flex min-w-0 flex-1 items-end gap-1 rounded-[1.6rem] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] px-1.5 py-1 shadow-sm focus-within:border-[var(--itq-color-brand-500)]">
              <button
                aria-label={english ? "Emoji" : "الرموز"}
                aria-pressed={emojiPanelOpen}
                className={`grid size-9 shrink-0 place-items-center rounded-full transition disabled:opacity-50 ${
                  emojiPanelOpen
                    ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                    : "text-[var(--itq-color-muted)] hover:bg-[var(--itq-color-surface-soft)]"
                }`}
                data-chat-menu
                disabled={interactionLocked}
                onClick={() => setEmojiPanelOpen((value) => !value)}
                type="button"
              >
                <span className="text-xl leading-none">🙂</span>
              </button>
              <textarea
                aria-label={english ? "Message" : "الرسالة"}
                className="max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent py-1.5 text-sm leading-6 outline-none"
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
                aria-label={english ? "Attach an image or file" : "إرفاق صورة أو ملف"}
                className="grid size-9 shrink-0 place-items-center rounded-full text-[var(--itq-color-muted)] transition hover:bg-[var(--itq-color-surface-soft)] disabled:opacity-50"
                disabled={interactionLocked}
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                <PaperclipIcon className="size-5" />
              </button>
            </div>
            {body.trim().length > 0 && !recording ? (
              <button
                aria-label={english ? "Send message" : "إرسال الرسالة"}
                className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--itq-color-brand-700)] text-white shadow-sm transition hover:bg-[var(--itq-color-brand-800)] disabled:cursor-not-allowed disabled:opacity-50"
                disabled={interactionLocked}
                onClick={() => void submitText()}
                onMouseDown={(event) => event.preventDefault()}
                type="button"
              >
                <SendIcon className={`size-5 ${english ? "" : "-scale-x-100"}`} />
              </button>
            ) : (
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
                className={`grid size-11 shrink-0 place-items-center rounded-full shadow-sm transition disabled:opacity-50 ${
                  recording
                    ? "bg-[var(--itq-color-danger-600)] text-white"
                    : "bg-[var(--itq-color-brand-700)] text-white hover:bg-[var(--itq-color-brand-800)]"
                }`}
                disabled={recordingStarting || (pending && !recording)}
                onClick={() => void toggleRecording()}
                type="button"
              >
                <MicIcon className="size-5" />
              </button>
            )}
          </div>
          <p className="mt-1.5 px-2 text-[10px] font-semibold text-[var(--itq-color-muted)]">
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
            className="fixed inset-y-0 end-0 z-50 w-[min(92vw,24rem)] border-s border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] shadow-2xl xl:hidden"
            id={detailsPanelId}
            ref={detailsPanelRef}
            role="dialog"
            tabIndex={-1}
          >
            {detailsPanel}
          </aside>
        </>
      ) : null}

      {lightbox === undefined ? null : (
        <div
          aria-label={english ? "Image preview" : "معاينة الصورة"}
          aria-modal="true"
          className="fixed inset-0 z-[130] flex flex-col bg-black/95"
          onClick={() => setLightbox(undefined)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setLightbox(undefined);
          }}
          role="dialog"
          tabIndex={-1}
        >
          <div className="flex items-center justify-between gap-3 p-3 text-white">
            <bdi className="min-w-0 truncate text-sm font-bold" dir="auto">
              {lightbox.name}
            </bdi>
            <div className="flex shrink-0 items-center gap-1">
              <a
                aria-label={english ? "Download" : "تنزيل"}
                className="grid size-10 place-items-center rounded-full hover:bg-white/10"
                href={lightbox.download}
                onClick={(event) => event.stopPropagation()}
              >
                <ArrowIcon className="size-5 rotate-90" />
              </a>
              <button
                aria-label={english ? "Close" : "إغلاق"}
                className="grid size-10 place-items-center rounded-full hover:bg-white/10"
                onClick={() => setLightbox(undefined)}
                type="button"
              >
                <CloseIcon className="size-5" />
              </button>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-2">
            <img
              alt={lightbox.name}
              className="max-h-full max-w-full object-contain"
              onClick={(event) => event.stopPropagation()}
              src={lightbox.src}
            />
          </div>
        </div>
      )}
    </section>
  );
}
