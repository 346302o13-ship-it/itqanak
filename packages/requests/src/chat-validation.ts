import { RequestDomainError } from "./errors.js";
import { chatContentTypes, type ChatContentType, type SendChatMessageInput } from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const maximumBodyLength = 10_000;
const maximumMetadataBytes = 16_384;

export interface NormalizedChatMessageInput {
  readonly contentType: ChatContentType;
  readonly body?: string;
  readonly attachmentId?: string;
  readonly clientMessageId?: string;
  readonly metadata: SendChatMessageInput["metadata"] extends infer Metadata
    ? Exclude<Metadata, undefined>
    : never;
}

export interface NormalizedPage {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function normalizeBoundedPage(
  page: number | undefined,
  pageSize: number | undefined,
  maximumPageSize: number,
): NormalizedPage {
  const normalizedPage = Number.isSafeInteger(page) && (page ?? 0) >= 1 ? page! : 1;
  const requestedSize = Number.isSafeInteger(pageSize) && (pageSize ?? 0) >= 1 ? pageSize! : 20;
  const normalizedPageSize = Math.min(requestedSize, maximumPageSize);
  return {
    page: normalizedPage,
    pageSize: normalizedPageSize,
    offset: (normalizedPage - 1) * normalizedPageSize,
  };
}

export function normalizeChatMessageInput(input: SendChatMessageInput): NormalizedChatMessageInput {
  if (!(chatContentTypes as readonly string[]).includes(input.contentType)) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }

  const normalizedBody = input.body?.normalize("NFC").trim();
  const body =
    normalizedBody === undefined || normalizedBody.length === 0 ? undefined : normalizedBody;
  if (body !== undefined && (body.length > maximumBodyLength || body.includes("\0"))) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }

  const attachmentId = input.attachmentId?.trim() || undefined;
  if (attachmentId !== undefined && !isUuid(attachmentId)) {
    throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
  }
  const clientMessageId = input.clientMessageId?.trim() || undefined;
  if (clientMessageId !== undefined && !isUuid(clientMessageId)) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }

  if (
    (input.contentType === "TEXT" ||
      input.contentType === "SYSTEM" ||
      input.contentType === "ACTION") &&
    (body === undefined || attachmentId !== undefined)
  ) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  if (
    (input.contentType === "IMAGE" ||
      input.contentType === "AUDIO" ||
      input.contentType === "FILE") &&
    attachmentId === undefined
  ) {
    throw new RequestDomainError("MESSAGE_ATTACHMENT_REQUIRED");
  }

  const metadata = input.metadata ?? {};
  let serializedMetadata: string;
  try {
    serializedMetadata = JSON.stringify(metadata);
  } catch {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  if (Buffer.byteLength(serializedMetadata, "utf8") > maximumMetadataBytes) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }

  return {
    contentType: input.contentType,
    ...(body === undefined ? {} : { body }),
    ...(attachmentId === undefined ? {} : { attachmentId }),
    ...(clientMessageId === undefined ? {} : { clientMessageId }),
    metadata,
  };
}

export function assertChatAttachmentMatchesContent(
  contentType: ChatContentType,
  detectedMimeType: string,
): void {
  if (contentType === "IMAGE" && !detectedMimeType.startsWith("image/")) {
    throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
  }
  if (contentType === "AUDIO" && !detectedMimeType.startsWith("audio/")) {
    throw new RequestDomainError("INVALID_MESSAGE_ATTACHMENT");
  }
}

export function receiptStatusRank(status: "SENT" | "DELIVERED" | "READ"): number {
  if (status === "SENT") {
    return 0;
  }
  return status === "DELIVERED" ? 1 : 2;
}
