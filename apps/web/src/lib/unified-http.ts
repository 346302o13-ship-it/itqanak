import type {
  CreateServiceQuoteInput,
  NotificationListInput,
  RespondToServiceQuoteInput,
  SendUnifiedMessageInput,
  UnifiedConversationListInput,
  UnifiedMessageListInput,
  WithdrawServiceQuoteInput,
} from "@itqanak/requests";

import { formValue } from "./auth-runtime";

export type JsonReady<T> = T extends Date
  ? string
  : T extends readonly (infer Item)[]
    ? readonly JsonReady<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: JsonReady<T[Key]> }
      : T;

export function jsonReady<T>(value: T): JsonReady<T> {
  return JSON.parse(JSON.stringify(value)) as JsonReady<T>;
}

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  if (value === null || !/^\d{1,6}$/u.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, maximum) : fallback;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function messageListInput(searchParams: URLSearchParams): UnifiedMessageListInput {
  const afterId = searchParams.get("afterId")?.trim();
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1_000),
    pageSize: positiveInteger(searchParams.get("pageSize"), 50, 100),
    ...(afterId !== undefined && uuidPattern.test(afterId) ? { afterId } : {}),
  };
}

export function conversationListInput(searchParams: URLSearchParams): UnifiedConversationListInput {
  const search = searchParams.get("q")?.trim().slice(0, 100);
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1_000),
    pageSize: positiveInteger(searchParams.get("pageSize"), 30, 100),
    ...(search === undefined || search.length === 0 ? {} : { search }),
  };
}

export function notificationListInput(searchParams: URLSearchParams): NotificationListInput {
  return {
    page: positiveInteger(searchParams.get("page"), 1, 1_000),
    pageSize: positiveInteger(searchParams.get("pageSize"), 20, 100),
    unreadOnly: searchParams.get("unreadOnly") === "true",
  };
}

export function unifiedMessageInput(formData: FormData): SendUnifiedMessageInput {
  return {
    contentType: formValue(formData, "contentType") as SendUnifiedMessageInput["contentType"],
    body: formValue(formData, "body"),
    requestId: formValue(formData, "requestId"),
    attachmentId: formValue(formData, "attachmentId"),
    clientMessageId: formValue(formData, "clientMessageId"),
  };
}

export function createQuoteInput(formData: FormData): CreateServiceQuoteInput {
  return {
    requestId: formValue(formData, "requestId"),
    expectedRequestVersion: Number(formValue(formData, "expectedRequestVersion")),
    amountMinor: Number(formValue(formData, "amountMinor")),
    currency: formValue(formData, "currency") as CreateServiceQuoteInput["currency"],
    descriptionAr: formValue(formData, "descriptionAr"),
    descriptionEn: formValue(formData, "descriptionEn"),
    expiresAt: formValue(formData, "expiresAt"),
    clientQuoteId: formValue(formData, "clientQuoteId"),
  };
}

export function quoteResponseInput(formData: FormData): RespondToServiceQuoteInput {
  return {
    expectedVersion: Number(formValue(formData, "expectedVersion")),
    decision: formValue(formData, "decision") as RespondToServiceQuoteInput["decision"],
    clientActionId: formValue(formData, "clientActionId"),
  };
}

export function quoteWithdrawalInput(formData: FormData): WithdrawServiceQuoteInput {
  return {
    expectedVersion: Number(formValue(formData, "expectedVersion")),
    expectedRequestVersion: Number(formValue(formData, "expectedRequestVersion")),
    clientActionId: formValue(formData, "clientActionId"),
  };
}
