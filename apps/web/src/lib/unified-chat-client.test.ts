import { describe, expect, it } from "vitest";

import type { UnifiedMessage } from "@itqanak/requests";

import {
  decimalAmountToMinor,
  formatQuoteAmount,
  hasPendingQuoteForRequest,
  hydrateUnifiedConversationSummary,
  mergeUnifiedMessages,
  pollingDelay,
} from "./unified-chat-client";

function message(id: string, sentAt: string): UnifiedMessage {
  return {
    id,
    conversationId: "conversation",
    senderType: "STUDENT",
    senderUserId: "student",
    contentType: "TEXT",
    body: id,
    metadata: {},
    status: "SENT",
    sentAt: new Date(sentAt),
  };
}

describe("unified chat client helpers", () => {
  it("merges polling pages without duplicates and restores chronological order", () => {
    const result = mergeUnifiedMessages(
      [message("second", "2026-08-20T10:01:00.000Z")],
      [
        { ...message("first", "2026-08-20T10:00:00.000Z"), sentAt: "2026-08-20T10:00:00.000Z" },
        { ...message("second", "2026-08-20T10:01:00.000Z"), sentAt: "2026-08-20T10:01:00.000Z" },
      ],
    );

    expect(result.map((item) => item.id)).toEqual(["first", "second"]);
    expect(result.every((item) => item.sentAt instanceof Date)).toBe(true);
  });

  it("converts bilingual decimal input to exact currency minor units", () => {
    expect(decimalAmountToMinor("125.50", "SAR")).toBe(12_550);
    expect(decimalAmountToMinor("١٢٥٫٥", "SAR")).toBe(12_550);
    expect(decimalAmountToMinor("12.345", "KWD")).toBe(12_345);
    expect(decimalAmountToMinor("12.345", "AED")).toBeUndefined();
    expect(decimalAmountToMinor("0", "SAR")).toBeUndefined();
  });

  it("formats quote amounts without floating-point input in the UI", () => {
    expect(formatQuoteAmount(12_550, "SAR", 2, "en")).toContain("125.50");
    expect(formatQuoteAmount(12_345, "KWD", 3, "en")).toContain("12.345");
  });

  it("backs off failed polling and reduces background polling", () => {
    expect(pollingDelay(0, true)).toBe(3_500);
    expect(pollingDelay(4, true)).toBe(30_000);
    expect(pollingDelay(0, false)).toBe(15_000);
  });

  it("hydrates conversation list dates received from JSON polling", () => {
    const result = hydrateUnifiedConversationSummary({
      id: "conversation",
      studentUserId: "student",
      studentDisplayName: "Student",
      unreadCount: 2,
      requestCount: 1,
      activeRequestCount: 1,
      createdAt: "2026-08-20T10:00:00.000Z",
      lastMessageAt: "2026-08-20T10:02:00.000Z",
      latestRequest: {
        id: "request",
        requestNumber: "ITQ-2026-000001",
        title: "Request",
        status: "SUBMITTED",
        version: 1,
        updatedAt: "2026-08-20T10:01:00.000Z",
      },
    });

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.lastMessageAt).toBeInstanceOf(Date);
    expect(result.latestRequest?.updatedAt).toBeInstanceOf(Date);
  });

  it("blocks a replacement quote only while the request has a live pending quote", () => {
    const base = message("quote-message", "2026-08-20T10:00:00.000Z");
    const quote = {
      id: "quote",
      conversationId: "conversation",
      requestId: "request",
      studentUserId: "student",
      amountMinor: 10_000,
      currency: "SAR",
      minorUnit: 2,
      descriptionAr: "عرض اختبار",
      descriptionEn: "Test quote",
      expiresAt: new Date("2026-08-22T10:00:00.000Z"),
      status: "PENDING",
      version: 1,
      createdByUserId: "admin",
      createdAt: new Date("2026-08-20T10:00:00.000Z"),
      updatedAt: new Date("2026-08-20T10:00:00.000Z"),
    } as const;
    const withQuote: UnifiedMessage = {
      ...base,
      contentType: "ACTION",
      quote,
    };
    expect(
      hasPendingQuoteForRequest([withQuote], "request", new Date("2026-08-21T10:00:00.000Z")),
    ).toBe(true);
    expect(
      hasPendingQuoteForRequest([withQuote], "request", new Date("2026-08-23T10:00:00.000Z")),
    ).toBe(false);
    expect(
      hasPendingQuoteForRequest(
        [{ ...withQuote, quote: { ...quote, status: "WITHDRAWN" } }],
        "request",
      ),
    ).toBe(false);
  });
});
