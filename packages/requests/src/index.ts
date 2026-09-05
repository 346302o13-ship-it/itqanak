export { RequestDomainError, requestErrorCodes, type RequestErrorCode } from "./errors.js";
export {
  assertRequestFieldsSubmittable,
  normalizeDraftRequestInput,
  requestSubmissionFingerprint,
} from "./validation.js";
export { RequestService, type RequestServiceOptions } from "./service.js";
export { AdminRequestService, type AdminRequestServiceOptions } from "./admin-service.js";
export { StorageAdminService, type StorageAdminServiceOptions } from "./storage-admin.js";
export { recordOutboxLifecycleEvent } from "./outbox-record.js";
export {
  canArchivePendingRequest,
  isStalePendingStatus,
  stalePendingRequestReason,
  STALE_PENDING_STATUSES,
  STALE_PENDING_THRESHOLD_DAYS,
  type ArchivePendingRejection,
  type StalePendingStatus,
} from "./pending-requests.js";
export { ChatService, type ChatServiceOptions } from "./chat-service.js";
export { SupportService, type SupportServiceOptions } from "./support-service.js";
export {
  UnifiedConversationService,
  type UnifiedConversationServiceOptions,
} from "./unified-conversation-service.js";
export { ServiceQuoteService, type ServiceQuoteServiceOptions } from "./quote-service.js";
export { NotificationService, type NotificationServiceOptions } from "./notification-service.js";
export {
  AssistantHistoryService,
  type AssistantHistoryServiceOptions,
  type AssistantMessageRow,
} from "./assistant-history-service.js";
export {
  AdminQuickRepliesService,
  type AdminQuickRepliesServiceOptions,
  type AdminQuickReply,
} from "./admin-quick-replies-service.js";
export {
  GroupChannelService,
  type GroupChannelServiceOptions,
  type GroupChannelMessage,
  type GroupChannelView,
  type GroupChannelPostInput,
  type GroupChannelPostResult,
  type GroupChannelSenderType,
} from "./group-channel-service.js";
export {
  announcementPreview,
  computeGroupUnread,
  normalizeGroupChannelBody,
  GROUP_CHANNEL_BODY_MAX,
  GROUP_CHANNEL_PREVIEW_MAX,
} from "./group-channel-logic.js";
export {
  UnifiedConversationAttachmentService,
  type AddUnifiedConversationAttachmentInput,
  type UnifiedConversationAttachmentServiceOptions,
} from "./unified-attachments.js";
export {
  normalizeQuoteResponseInput,
  normalizeServiceQuoteInput,
  normalizeUnifiedEditBody,
  normalizeUnifiedMessageInput,
  type NormalizedQuoteResponseInput,
  type NormalizedServiceQuoteInput,
  type NormalizedUnifiedMessageInput,
} from "./unified-validation.js";
export {
  assertChatAttachmentMatchesContent,
  isUuid,
  normalizeBoundedPage,
  normalizeChatMessageInput,
  receiptStatusRank,
  type NormalizedChatMessageInput,
  type NormalizedPage,
} from "./chat-validation.js";
export {
  RequestAttachmentService,
  type AddAttachmentInput,
  type AuthorizedAttachmentDownload,
  type RequestAttachmentServiceOptions,
} from "./attachments.js";
export { AttachmentScanProcessor, type AttachmentScanProcessorOptions } from "./scan-processor.js";
export {
  UnifiedAttachmentScanProcessor,
  type UnifiedAttachmentScanProcessorOptions,
} from "./unified-attachment-scan-processor.js";
export {
  UnifiedAttachmentStorageReconciler,
  type UnifiedAttachmentStorageReconcilerOptions,
} from "./unified-attachment-reconciliation.js";
export {
  UnifiedAttachmentRetentionSweeper,
  type UnifiedAttachmentRetentionSweeperOptions,
} from "./unified-attachment-retention.js";
export {
  MessageRetentionSweeper,
  ARCHIVED_MESSAGE_MARKER,
  type MessageRetentionSweeperOptions,
} from "./message-retention.js";
export {
  AttachmentStorageReconciler,
  boundedReconciliationLimit,
  removeReferencedObjectIfPresent,
  type AttachmentStorageReconcilerOptions,
  type AttachmentStorageReconciliationPreview,
  type AttachmentStorageReconciliationResult,
} from "./reconciliation.js";
export {
  academicLevels,
  attachmentScanStatuses,
  attachmentStorageStatuses,
  chatContentTypes,
  chatSenderTypes,
  messageReceiptStatuses,
  requestLanguageCodes,
  requestSorts,
  requestUrgencies,
  type AcademicLevel,
  type AttachmentScanStatus,
  type AttachmentStorageStatus,
  type AdminRequestDetail,
  type AdminCreateRequestInput,
  type AdminRequestEditInput,
  type AdminRequestListInput,
  type AdminRequestListResult,
  type AdminRequestSummary,
  type AdminRequestTransitionInput,
  type AssignRequestInput,
  type CancelRequestInput,
  type ChatContentType,
  type ChatMessage,
  type ChatMessageAttachment,
  type ChatMessageListInput,
  type ChatMessageListResult,
  type ChatSenderType,
  type ConversationListInput,
  type ConversationListResult,
  type ConversationSummary,
  type CreatedDraftResult,
  type DraftRequestInput,
  type NormalizedRequestFields,
  type MarkConversationResult,
  type MessageReceiptStatus,
  type RequestAttachmentSummary,
  type RequestEventSummary,
  type RequestLanguageCode,
  type RequestListInput,
  type RequestListResult,
  type RequestAssignmentSummary,
  type RequestSort,
  type RequestUrgency,
  type ServiceRequestDetail,
  type ServiceRequestSummary,
  type SendChatMessageInput,
  type SendChatMessageResult,
  type StudentDashboard,
  type SupportConversationListInput,
  type SupportConversationListResult,
  type SupportConversationSummary,
  type SupportMessage,
  type SupportMessageListResult,
  type SendSupportMessageInput,
  type SendSupportMessageResult,
  type SubmitRequestInput,
  type ArchivePendingRequestsInput,
  type ArchivePendingRequestsResult,
  type RetentionSweepPreview,
  type StalePendingRequestFilter,
  type StalePendingRequestItem,
  type StalePendingRequestReport,
  type StorageAdminAttachment,
  type StorageAdminFilter,
  type StorageAdminReport,
  type StudentRequestTransitionInput,
  type UpdateDraftRequestInput,
  notificationKinds,
  serviceQuoteCurrencies,
  serviceQuoteStatuses,
  unifiedHumanContentTypes,
  type CreateServiceQuoteInput,
  type CreateServiceQuoteResult,
  type MarkNotificationsReadResult,
  type NotificationKind,
  type NotificationListInput,
  type NotificationListResult,
  type RespondToServiceQuoteInput,
  type RespondToServiceQuoteResult,
  type WithdrawServiceQuoteInput,
  type WithdrawServiceQuoteResult,
  type SendUnifiedMessageInput,
  type SendUnifiedMessageResult,
  type ServiceQuote,
  type ServiceQuoteCurrency,
  type ServiceQuoteStatus,
  type ConversationOutstandingLine,
  type UnifiedConversationAttachment,
  type UnifiedConversationDetail,
  type UnifiedConversationListInput,
  type UnifiedConversationListResult,
  type UnifiedConversationSummary,
  type UnifiedHumanContentType,
  messageReactionEmojis,
  type MessageReactionEmoji,
  type UnifiedMessage,
  type UnifiedMessageAttachment,
  type UnifiedMessageReaction,
  type UnifiedMessageReply,
  type UnifiedMessageListInput,
  type UnifiedMessageListResult,
  type UnifiedPinnedMessage,
  type UnifiedRequestSummary,
  type UserNotification,
} from "./types.js";
