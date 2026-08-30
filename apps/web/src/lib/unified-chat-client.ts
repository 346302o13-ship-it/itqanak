import type {
  ServiceQuote,
  ServiceQuoteCurrency,
  UnifiedConversationSummary,
  UnifiedMessage,
  UnifiedRequestSummary,
} from "@itqanak/requests";

type WireRequest = Omit<UnifiedRequestSummary, "updatedAt"> & {
  readonly updatedAt: Date | string;
};

type WireQuote = Omit<ServiceQuote, "createdAt" | "expiresAt" | "respondedAt" | "updatedAt"> & {
  readonly createdAt: Date | string;
  readonly expiresAt: Date | string;
  readonly respondedAt?: Date | string;
  readonly updatedAt: Date | string;
};

export type WireUnifiedMessage = Omit<
  UnifiedMessage,
  "quote" | "request" | "sentAt" | "editedAt" | "deletedAt"
> & {
  readonly quote?: WireQuote;
  readonly request?: WireRequest;
  readonly sentAt: Date | string;
  readonly editedAt?: Date | string;
  readonly deletedAt?: Date | string;
};

export type WireUnifiedConversationSummary = Omit<
  UnifiedConversationSummary,
  "createdAt" | "lastMessageAt" | "latestRequest"
> & {
  readonly createdAt: Date | string;
  readonly lastMessageAt?: Date | string;
  readonly latestRequest?: WireRequest;
};

const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

function validDate(value: Date | string): Date {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new Error("Invalid chat date.");
  return parsed;
}

function hydrateRequest(request: WireRequest): UnifiedRequestSummary {
  return { ...request, updatedAt: validDate(request.updatedAt) };
}

export function hydrateUnifiedConversationSummary(
  conversation: WireUnifiedConversationSummary,
): UnifiedConversationSummary {
  const { lastMessageAt, latestRequest, ...summary } = conversation;
  return {
    ...summary,
    createdAt: validDate(conversation.createdAt),
    ...(lastMessageAt === undefined ? {} : { lastMessageAt: validDate(lastMessageAt) }),
    ...(latestRequest === undefined ? {} : { latestRequest: hydrateRequest(latestRequest) }),
  };
}

function hydrateQuote(quote: WireQuote): ServiceQuote {
  const { respondedAt, ...quoteWithoutResponse } = quote;
  return {
    ...quoteWithoutResponse,
    createdAt: validDate(quote.createdAt),
    expiresAt: validDate(quote.expiresAt),
    ...(respondedAt === undefined ? {} : { respondedAt: validDate(respondedAt) }),
    updatedAt: validDate(quote.updatedAt),
  };
}

export function hydrateUnifiedMessage(message: WireUnifiedMessage): UnifiedMessage {
  const { quote, request, editedAt, deletedAt, ...messageWithoutRelations } = message;
  return {
    ...messageWithoutRelations,
    ...(request === undefined ? {} : { request: hydrateRequest(request) }),
    ...(quote === undefined ? {} : { quote: hydrateQuote(quote) }),
    ...(editedAt === undefined ? {} : { editedAt: validDate(editedAt) }),
    ...(deletedAt === undefined ? {} : { deletedAt: validDate(deletedAt) }),
    sentAt: validDate(message.sentAt),
  };
}

export function mergeUnifiedMessages(
  current: readonly UnifiedMessage[],
  incoming: readonly WireUnifiedMessage[],
): UnifiedMessage[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const wireMessage of incoming) {
    const hydrated = hydrateUnifiedMessage(wireMessage);
    byId.set(hydrated.id, hydrated);
  }
  return [...byId.values()].sort((left, right) => {
    const timeDifference = left.sentAt.getTime() - right.sentAt.getTime();
    return timeDifference === 0 ? left.id.localeCompare(right.id) : timeDifference;
  });
}

export function pollingDelay(failedAttempts: number, visible: boolean): number {
  // A hidden tab barely needs to poll; a healthy visible tab sits at 5s and backs
  // off exponentially to a full minute while the server or network is unhappy.
  if (!visible) return 20_000;
  const boundedFailures = Math.max(0, Math.min(4, Math.floor(failedAttempts)));
  return Math.min(60_000, 5_000 * 2 ** boundedFailures);
}

export function currencyMinorUnit(currency: ServiceQuoteCurrency): 2 | 3 {
  return currency === "KWD" ? 3 : 2;
}

function asciiNumber(value: string): string {
  return [...value.trim()]
    .map((character) => {
      const arabicIndex = arabicDigits.indexOf(character);
      if (arabicIndex >= 0) return String(arabicIndex);
      if (character === "٫" || character === ",") return ".";
      return character;
    })
    .join("");
}

export function decimalAmountToMinor(
  value: string,
  currency: ServiceQuoteCurrency,
): number | undefined {
  const normalized = asciiNumber(value);
  if (!/^\d{1,9}(?:\.\d{1,3})?$/u.test(normalized)) return undefined;
  const [units = "0", fraction = ""] = normalized.split(".");
  const places = currencyMinorUnit(currency);
  if (fraction.length > places) return undefined;
  const minor = Number(units) * 10 ** places + Number(fraction.padEnd(places, "0"));
  if (!Number.isSafeInteger(minor) || minor < 1) return undefined;
  return minor;
}

export function formatQuoteAmount(
  amountMinor: number,
  currency: ServiceQuoteCurrency,
  minorUnit: 2 | 3,
  locale: "ar" | "en",
): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "ar-SA", {
    style: "currency",
    currency,
    minimumFractionDigits: minorUnit,
    maximumFractionDigits: minorUnit,
  }).format(amountMinor / 10 ** minorUnit);
}

export function replaceQuoteInMessages(
  messages: readonly UnifiedMessage[],
  quote: ServiceQuote,
): UnifiedMessage[] {
  return messages.map((message) =>
    message.quote?.id === quote.id ? { ...message, quote } : message,
  );
}

export function hasPendingQuoteForRequest(
  messages: readonly UnifiedMessage[],
  requestId: string,
  now: Date = new Date(),
): boolean {
  return messages.some(
    (message) =>
      message.quote?.requestId === requestId &&
      message.quote.status === "PENDING" &&
      message.quote.expiresAt.getTime() > now.getTime(),
  );
}

/** Any quote was ever raised for this request — pending, accepted, expired… */
export function hasAnyQuoteForRequest(
  messages: readonly UnifiedMessage[],
  requestId: string,
): boolean {
  return messages.some((message) => message.quote?.requestId === requestId);
}
