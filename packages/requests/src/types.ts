import {
  requestAcademicLevels,
  requestLanguageCodes,
  requestUrgencies,
  type JsonObject,
  type RequestAcademicLevel,
  type RequestLanguageCode,
  type RequestStatus,
  type RequestUrgency,
} from "@itqanak/core";

export { requestLanguageCodes, requestUrgencies };
export const academicLevels = requestAcademicLevels;
export type { RequestLanguageCode, RequestUrgency };
export type AcademicLevel = RequestAcademicLevel;

export const requestSorts = ["newest", "oldest", "deadline"] as const;
export type RequestSort = (typeof requestSorts)[number];

export const attachmentStorageStatuses = [
  "PENDING_UPLOAD",
  "STORED",
  "DELETE_PENDING",
  "DELETED",
  "UPLOAD_FAILED",
  // Object purged for retention; the row (name/size/type) is kept.
  "EXPIRED",
] as const;
export type AttachmentStorageStatus = (typeof attachmentStorageStatuses)[number];

export const attachmentScanStatuses = [
  "NOT_REQUIRED",
  "PENDING_SCAN",
  "CLEAN",
  "INFECTED",
  "SCAN_ERROR",
  "SCAN_SKIPPED_DEVELOPMENT",
  "SCAN_SKIPPED_BY_ADMIN",
  "REJECTED",
] as const;
export type AttachmentScanStatus = (typeof attachmentScanStatuses)[number];

export interface DraftRequestInput {
  readonly serviceId: string;
  readonly submissionKey: string;
  readonly title?: string;
  readonly description?: string;
  readonly deadlineAt?: Date | string | null;
  readonly urgency?: RequestUrgency;
  readonly budgetAmount?: number | string | null;
  readonly budgetCurrency?: string | null;
  readonly languageCode?: RequestLanguageCode | null;
  readonly academicLevel?: AcademicLevel | null;
  readonly institutionName?: string | null;
  readonly privacyRequested?: boolean;
}

export interface UpdateDraftRequestInput
  extends Omit<DraftRequestInput, "serviceId" | "submissionKey"> {
  readonly expectedVersion: number;
}

export interface SubmitRequestInput {
  readonly expectedVersion: number;
  readonly acceptedAcademicIntegrity: boolean;
  readonly academicIntegrityVersion: string;
}

export interface CancelRequestInput {
  readonly expectedVersion: number;
}

export interface StudentRequestTransitionInput {
  readonly expectedVersion: number;
  readonly toStatus: RequestStatus;
}

export interface NormalizedRequestFields {
  readonly title: string;
  readonly description: string;
  readonly deadlineAt?: Date;
  readonly urgency: RequestUrgency;
  readonly budgetAmount?: string;
  readonly budgetCurrency?: string;
  readonly languageCode?: RequestLanguageCode;
  readonly academicLevel?: AcademicLevel;
  readonly institutionName?: string;
  readonly privacyRequested: boolean;
}

export interface ServiceRequestSummary {
  readonly id: string;
  readonly requestNumber: string;
  readonly serviceId: string;
  readonly serviceSlug: string;
  readonly serviceNameAr: string;
  readonly status: RequestStatus;
  readonly title: string;
  readonly deadlineAt?: Date;
  readonly urgency: RequestUrgency;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface RequestEventSummary {
  readonly id: string;
  readonly eventType: string;
  readonly fromStatus?: RequestStatus;
  readonly toStatus?: RequestStatus;
  readonly requestVersion: number;
  readonly createdAt: Date;
}

export interface RequestAttachmentSummary {
  readonly id: string;
  readonly originalFilename: string;
  readonly detectedMimeType?: string;
  readonly declaredMimeType: string;
  readonly sizeBytes: number;
  readonly storageStatus: AttachmentStorageStatus;
  readonly scanStatus: AttachmentScanStatus;
  readonly createdAt: Date;
  readonly deletedAt?: Date;
}

export interface ServiceRequestDetail extends ServiceRequestSummary {
  readonly description: string;
  readonly budgetAmount?: string;
  readonly budgetCurrency?: string;
  readonly languageCode?: RequestLanguageCode;
  readonly academicLevel?: AcademicLevel;
  readonly institutionName?: string;
  readonly privacyRequested: boolean;
  readonly submittedAt?: Date;
  readonly cancelledAt?: Date;
  readonly completedAt?: Date;
  readonly academicIntegrityVersion?: string;
  readonly events: readonly RequestEventSummary[];
  readonly attachments: readonly RequestAttachmentSummary[];
}

export interface RequestListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly status?: RequestStatus;
  readonly serviceId?: string;
  readonly sort?: RequestSort;
}

export interface RequestListResult {
  readonly items: readonly ServiceRequestSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface StudentDashboard {
  readonly activeCount: number;
  readonly waitingForStudentCount: number;
  readonly completedCount: number;
  readonly recent: readonly ServiceRequestSummary[];
}

export interface CreatedDraftResult {
  readonly request: ServiceRequestSummary;
  readonly idempotentReplay: boolean;
}

export const chatContentTypes = ["TEXT", "IMAGE", "AUDIO", "FILE", "SYSTEM", "ACTION"] as const;
export type ChatContentType = (typeof chatContentTypes)[number];

export const chatSenderTypes = ["STUDENT", "ADMIN", "SYSTEM"] as const;
export type ChatSenderType = (typeof chatSenderTypes)[number];

export const messageReceiptStatuses = ["SENT", "DELIVERED", "READ"] as const;
export type MessageReceiptStatus = (typeof messageReceiptStatuses)[number];

export interface RequestAssignmentSummary {
  readonly id: string;
  readonly adminUserId: string;
  readonly adminDisplayName: string;
  readonly assignedAt: Date;
}

export interface AdminRequestSummary extends ServiceRequestSummary {
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly studentPhoneE164?: string;
  readonly studentCountryCode?: "SA" | "AE" | "KW";
  readonly studentPhoneVerified: boolean;
  readonly assignment?: RequestAssignmentSummary;
  readonly conversationId: string;
  readonly unreadMessageCount: number;
}

export interface AdminRequestDetail extends AdminRequestSummary {
  readonly description: string;
  readonly budgetAmount?: string;
  readonly budgetCurrency?: string;
  readonly languageCode?: RequestLanguageCode;
  readonly academicLevel?: AcademicLevel;
  readonly institutionName?: string;
  readonly privacyRequested: boolean;
  readonly submittedAt?: Date;
  readonly cancelledAt?: Date;
  readonly completedAt?: Date;
  readonly events: readonly RequestEventSummary[];
  readonly attachments: readonly RequestAttachmentSummary[];
}

export interface AdminRequestListInput extends RequestListInput {
  readonly assignedAdminUserId?: string;
  readonly unassignedOnly?: boolean;
}

export interface AdminRequestListResult {
  readonly items: readonly AdminRequestSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface AdminRequestTransitionInput {
  readonly expectedVersion: number;
  readonly toStatus: RequestStatus;
}

export interface StalePendingRequestFilter {
  /** Restrict to a single non-terminal status. */
  readonly status?: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "QUOTED";
  /** Restrict to a single student. */
  readonly studentUserId?: string;
  /** Only requests idle at least this many days (on top of the per-status floor). */
  readonly minDaysPending?: number;
  /** "exclude" (default) hides archived requests; "only" shows just archived ones. */
  readonly includeArchived?: "exclude" | "only";
  readonly page?: number;
  readonly pageSize?: number;
}

export interface StalePendingRequestItem {
  readonly id: string;
  readonly requestNumber: string;
  readonly status: "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "QUOTED";
  readonly title: string;
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly serviceNameAr: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly daysPending: number;
  readonly reason: string;
  /** True when a financial due is attached — such a request is never archivable. */
  readonly hasFinancialRecord: boolean;
  readonly archivedAt?: Date;
  readonly archivedByName?: string;
  readonly archiveReason?: string;
}

export interface ArchivePendingRequestsInput {
  readonly requestIds: readonly string[];
  readonly reason?: string;
}

export interface ArchivePendingRequestsResult {
  readonly archivedIds: readonly string[];
  readonly skipped: readonly {
    readonly id: string;
    readonly reason: "NOT_FOUND" | "NOT_PENDING" | "HAS_FINANCE" | "ALREADY_ARCHIVED";
  }[];
}

export interface StalePendingRequestReport {
  readonly items: readonly StalePendingRequestItem[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
  readonly stats: {
    readonly total: number;
    readonly draft: number;
    readonly submitted: number;
    readonly underReview: number;
    readonly quoted: number;
  };
}

export interface AdminRequestEditInput {
  readonly expectedVersion: number;
  readonly title: string;
  readonly description: string;
  readonly deadlineAt?: Date | string | null;
  readonly urgency: RequestUrgency;
}

export interface AdminCreateRequestInput extends DraftRequestInput {
  readonly studentUserId: string;
  /** Defaults to true; false explicitly keeps a student-review draft. */
  readonly submitImmediately?: boolean;
}

export interface AssignRequestInput {
  readonly expectedVersion: number;
  readonly adminUserId?: string | null;
}

export interface ChatMessageAttachment {
  readonly id: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly scanStatus: AttachmentScanStatus;
}

export interface ChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderType: ChatSenderType;
  readonly senderUserId?: string;
  readonly senderDisplayName?: string;
  readonly contentType: ChatContentType;
  readonly body?: string;
  readonly attachment?: ChatMessageAttachment;
  readonly clientMessageId?: string;
  readonly metadata: JsonObject;
  readonly status: MessageReceiptStatus;
  readonly sentAt: Date;
}

export interface SendChatMessageInput {
  readonly contentType: ChatContentType;
  readonly body?: string | null;
  readonly attachmentId?: string | null;
  readonly clientMessageId?: string;
  readonly metadata?: JsonObject;
}

export interface SendChatMessageResult {
  readonly message: ChatMessage;
  readonly idempotentReplay: boolean;
}

export interface ChatMessageListInput {
  readonly page?: number;
  readonly pageSize?: number;
}

export interface ChatMessageListResult {
  /** Items are chronological within the selected page. */
  readonly items: readonly ChatMessage[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface ConversationSummary {
  readonly id: string;
  readonly requestId: string;
  readonly requestNumber: string;
  readonly requestTitle: string;
  readonly requestStatus: RequestStatus;
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly studentPhoneE164?: string;
  readonly assignedAdminUserId?: string;
  readonly assignedAdminDisplayName?: string;
  readonly lastMessageType?: ChatContentType;
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: Date;
  readonly unreadCount: number;
}

export interface ConversationListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
  readonly requestStatus?: RequestStatus;
  readonly assignedAdminUserId?: string;
  readonly unassignedOnly?: boolean;
}

export interface ConversationListResult {
  readonly items: readonly ConversationSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface MarkConversationResult {
  readonly conversationId: string;
  readonly updatedMessageCount: number;
  readonly status: "DELIVERED" | "READ";
}

export interface SupportConversationSummary {
  readonly id: string;
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly studentPhoneE164: string;
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: Date;
  readonly unreadCount: number;
  readonly createdAt: Date;
}

export interface SupportConversationListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

export interface SupportConversationListResult {
  readonly items: readonly SupportConversationSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface SupportMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderType: ChatSenderType;
  readonly senderUserId?: string;
  readonly senderDisplayName?: string;
  readonly contentType: ChatContentType;
  readonly body: string;
  readonly clientMessageId?: string;
  readonly metadata: JsonObject;
  readonly status: MessageReceiptStatus;
  readonly sentAt: Date;
}

export interface SupportMessageListResult {
  readonly items: readonly SupportMessage[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface SendSupportMessageInput {
  readonly body: string;
  readonly clientMessageId?: string;
}

export interface SendSupportMessageResult {
  readonly message: SupportMessage;
  readonly idempotentReplay: boolean;
}

export const unifiedHumanContentTypes = ["TEXT", "IMAGE", "AUDIO", "FILE"] as const;
export type UnifiedHumanContentType = (typeof unifiedHumanContentTypes)[number];

export const serviceQuoteStatuses = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "WITHDRAWN",
] as const;
export type ServiceQuoteStatus = (typeof serviceQuoteStatuses)[number];

export const serviceQuoteCurrencies = ["SAR", "AED", "KWD"] as const;
export type ServiceQuoteCurrency = (typeof serviceQuoteCurrencies)[number];

export interface UnifiedRequestSummary {
  readonly id: string;
  readonly requestNumber: string;
  readonly title: string;
  readonly status: RequestStatus;
  readonly version: number;
  readonly updatedAt: Date;
  /** Name of the service the request is for (conversation request list only). */
  readonly serviceName?: string;
  /** Short request description, for the "request created" chat card. */
  readonly summary?: string;
  /** Present only in the conversation's own request list (admin panel chips). */
  readonly finance?: {
    /** True once a live (UNPAID/PAID) due exists — the request is then locked from re-pricing. */
    readonly hasDue: boolean;
    readonly dueStatus?: "UNPAID" | "PAID";
    readonly hasPendingReceipt: boolean;
    /** Review status of the most recent payment receipt for the request, if any. */
    readonly latestReceiptStatus?: "PENDING" | "ACCEPTED" | "REJECTED";
    /** Count of still-UNPAID dues on the request (splits can leave more than one). */
    readonly unpaidDueCount?: number;
    /** The current outstanding (or latest) due — set whenever `hasDue` is true. */
    readonly dueId?: string;
    readonly dueVersion?: number;
    readonly dueAmountMinor?: number;
    readonly dueCurrency?: string;
    readonly dueMinorUnit?: 2 | 3;
  };
}

export interface UnifiedMessageAttachment {
  readonly id: string;
  readonly source: "CONVERSATION" | "REQUEST_LEGACY";
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly scanStatus: AttachmentScanStatus | "SCAN_SKIPPED_BY_ADMIN";
  /** "EXPIRED" once the object has been purged for retention. */
  readonly storageStatus: AttachmentStorageStatus;
}

export interface ServiceQuote {
  readonly id: string;
  readonly conversationId: string;
  readonly requestId: string;
  readonly studentUserId: string;
  readonly amountMinor: number;
  readonly currency: ServiceQuoteCurrency;
  readonly minorUnit: 2 | 3;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly expiresAt: Date;
  readonly status: ServiceQuoteStatus;
  readonly version: number;
  readonly createdByUserId: string;
  readonly respondedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UnifiedMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderType: ChatSenderType;
  readonly senderUserId?: string;
  readonly senderDisplayName?: string;
  readonly contentType: ChatContentType;
  readonly body: string;
  readonly request?: UnifiedRequestSummary;
  readonly attachment?: UnifiedMessageAttachment;
  readonly quote?: ServiceQuote;
  readonly replyTo?: UnifiedMessageReply;
  readonly reactions?: readonly UnifiedMessageReaction[];
  readonly clientMessageId?: string;
  readonly metadata: JsonObject;
  readonly status: MessageReceiptStatus;
  readonly sentAt: Date;
  /** Set when the sender has edited the message; `body` is the current text. */
  readonly editedAt?: Date;
  /** Set when the sender has deleted the message; `body` is blanked. */
  readonly deletedAt?: Date;
  /**
   * True once the message has passed the retention window and its content was
   * moved out of the hot table; `body` is blanked and attachments / quotes /
   * request links are omitted. The chat shows an "archived" placeholder.
   */
  readonly archived?: boolean;
}

export interface UnifiedMessageReply {
  readonly id: string;
  readonly body: string;
  readonly senderType: ChatSenderType;
  readonly contentType: ChatContentType;
  /** True when the quoted message has since been deleted by its sender. */
  readonly deleted?: boolean;
}

/**
 * Allowed reaction emoji. The first six are the quick-tap bar (kept stable for
 * existing chips); the rest back a fuller picker. Each is a single scalar or a
 * short variation sequence so it stays inside the reactions table length check.
 */
export const messageReactionEmojis = [
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
export type MessageReactionEmoji = (typeof messageReactionEmojis)[number];

export interface UnifiedMessageReaction {
  readonly emoji: string;
  readonly count: number;
  /** True when the requesting principal is one of the reactors. */
  readonly mine: boolean;
}

export interface SendUnifiedMessageInput {
  readonly contentType: UnifiedHumanContentType;
  readonly body?: string | null;
  readonly requestId?: string | null;
  /** ID from unified_conversation_attachments, not a request attachment. */
  readonly attachmentId?: string | null;
  readonly clientMessageId?: string;
  /** Optional id of an earlier message in the same conversation being replied to. */
  readonly replyToMessageId?: string | null;
}

export interface SendUnifiedMessageResult {
  readonly message: UnifiedMessage;
  readonly idempotentReplay: boolean;
}

export interface UnifiedMessageListInput {
  readonly page?: number;
  readonly pageSize?: number;
  /**
   * Incremental read: return only messages chronologically after this message
   * id. The total count and page metadata are skipped. Used by the poller so a
   * steady-state poll returns ~0 rows instead of a full page plus a COUNT(*).
   */
  readonly afterId?: string;
  /**
   * Incremental read companion to `afterId`: an ISO timestamp cursor. The delta
   * additionally carries any message whose latest edit/delete happened after
   * this instant, so revisions to older messages are not missed by a poll that
   * only advances the `afterId` (newest-message) cursor.
   */
  readonly revisedAfter?: string;
}

export interface UnifiedMessageListResult {
  /** Items are chronological within the selected page. */
  readonly items: readonly UnifiedMessage[];
  readonly page: number;
  readonly pageSize: number;
  /** Present only on a full/paged read; omitted on an incremental (afterId) read. */
  readonly total?: number;
  /** Present only on a full/paged read; omitted on an incremental (afterId) read. */
  readonly pageCount?: number;
  /** True when this response is an incremental delta rather than a full page. */
  readonly incremental: boolean;
  /**
   * ISO timestamp the caller should send back as `revisedAfter` on its next
   * incremental poll. Everything edited or deleted at or before this instant is
   * already reflected in `items`.
   */
  readonly revisionCursor?: string;
}

export interface UnifiedConversationSummary {
  readonly id: string;
  readonly studentUserId: string;
  readonly studentDisplayName: string;
  readonly studentPhoneE164?: string;
  readonly studentEmail?: string;
  readonly lastMessagePreview?: string;
  readonly lastMessageAt?: Date;
  readonly unreadCount: number;
  readonly requestCount: number;
  readonly activeRequestCount: number;
  readonly latestRequest?: UnifiedRequestSummary;
  readonly createdAt: Date;
}

export interface ConversationOutstandingLine {
  readonly currency: string;
  readonly minorUnit: 2 | 3;
  readonly amountMinor: number;
  readonly dueCount: number;
}

export interface UnifiedConversationDetail extends UnifiedConversationSummary {
  readonly requests: readonly UnifiedRequestSummary[];
  /** Most recent activity on any live session of the student (admin view only). */
  readonly studentLastSeenAt?: Date;
  /** What the student still owes, per currency — shown at the top of the chat. */
  readonly outstanding: readonly ConversationOutstandingLine[];
}

export interface UnifiedConversationListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly search?: string;
}

export interface UnifiedConversationListResult {
  readonly items: readonly UnifiedConversationSummary[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface CreateServiceQuoteInput {
  readonly requestId: string;
  readonly expectedRequestVersion: number;
  readonly amountMinor: number;
  readonly currency: ServiceQuoteCurrency;
  readonly descriptionAr: string;
  readonly descriptionEn: string;
  readonly expiresAt: Date | string;
  readonly clientQuoteId: string;
}

export interface CreateServiceQuoteResult {
  readonly quote: ServiceQuote;
  readonly message: UnifiedMessage;
  readonly idempotentReplay: boolean;
}

export interface RespondToServiceQuoteInput {
  readonly expectedVersion: number;
  readonly decision: "ACCEPT" | "REJECT";
  readonly clientActionId: string;
}

export interface RespondToServiceQuoteResult {
  readonly quote: ServiceQuote;
  readonly message: UnifiedMessage;
  readonly idempotentReplay: boolean;
}

export interface WithdrawServiceQuoteInput {
  readonly expectedVersion: number;
  readonly expectedRequestVersion: number;
  readonly clientActionId: string;
}

export interface WithdrawServiceQuoteResult {
  readonly quote: ServiceQuote;
  readonly message: UnifiedMessage;
  readonly idempotentReplay: boolean;
}

export const notificationKinds = [
  "MESSAGE_RECEIVED",
  "REQUEST_UPDATED",
  "REQUEST_STATUS_UPDATED",
  "QUOTE_RECEIVED",
  "QUOTE_ACCEPTED",
  "QUOTE_REJECTED",
  "ACCOUNT_PENDING_APPROVAL",
  "SYSTEM_ANNOUNCEMENT",
] as const;
export type NotificationKind = (typeof notificationKinds)[number];

export interface UserNotification {
  readonly id: string;
  readonly kind: NotificationKind;
  readonly conversationId?: string;
  readonly requestId?: string;
  readonly messageId?: string;
  readonly quoteId?: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly bodyAr?: string;
  readonly bodyEn?: string;
  readonly actionHref?: string;
  readonly createdAt: Date;
  readonly readAt?: Date;
}

export interface NotificationListInput {
  readonly page?: number;
  readonly pageSize?: number;
  readonly unreadOnly?: boolean;
}

export interface NotificationListResult {
  readonly items: readonly UserNotification[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
  readonly pageCount: number;
  readonly unreadCount: number;
}

export interface MarkNotificationsReadResult {
  readonly updatedCount: number;
  readonly unreadCount: number;
}

export interface UnifiedConversationAttachment {
  readonly id: string;
  readonly conversationId: string;
  readonly requestId?: string;
  readonly originalFilename: string;
  readonly declaredMimeType: string;
  readonly detectedMimeType?: string;
  readonly sizeBytes: number;
  readonly storageStatus: AttachmentStorageStatus;
  readonly scanStatus: AttachmentScanStatus | "SCAN_SKIPPED_BY_ADMIN";
  readonly createdAt: Date;
}
