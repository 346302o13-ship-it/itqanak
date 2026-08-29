import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizeQuoteResponseInput,
  normalizeQuoteWithdrawalInput,
  normalizeServiceQuoteInput,
  normalizeUnifiedEditBody,
  normalizeUnifiedMessageInput,
} from "./unified-validation.js";

describe("unified conversation validation", () => {
  it("normalizes text and attachment messages with stable fingerprints", () => {
    const clientMessageId = randomUUID();
    const first = normalizeUnifiedMessageInput(
      { contentType: "TEXT", body: "  مرحباً\r\nبكم  ", clientMessageId },
      randomUUID(),
    );
    const replay = normalizeUnifiedMessageInput(
      { contentType: "TEXT", body: "مرحباً\nبكم", clientMessageId },
      randomUUID(),
    );
    expect(first.body).toBe("مرحباً\nبكم");
    expect(replay.fingerprint).toBe(first.fingerprint);

    expect(() =>
      normalizeUnifiedMessageInput(
        { contentType: "AUDIO", attachmentId: randomUUID() },
        randomUUID(),
      ),
    ).not.toThrow();
    expect(() => normalizeUnifiedMessageInput({ contentType: "FILE" }, randomUUID())).toThrowError(
      "MESSAGE_ATTACHMENT_REQUIRED",
    );
  });

  it("normalizes a message edit body and rejects empty or oversized text", () => {
    expect(normalizeUnifiedEditBody("  مرحباً\r\nمجددًا  ")).toBe("مرحباً\nمجددًا");
    expect(() => normalizeUnifiedEditBody("   ")).toThrowError("INVALID_MESSAGE");
    expect(() => normalizeUnifiedEditBody(undefined)).toThrowError("INVALID_MESSAGE");
    expect(() => normalizeUnifiedEditBody("x".repeat(10_001))).toThrowError("INVALID_MESSAGE");
    expect(() => normalizeUnifiedEditBody("bad\0null")).toThrowError("INVALID_MESSAGE");
  });

  it("normalizes currency minor units and bounded quote expiry", () => {
    const now = new Date("2026-08-20T12:00:00.000Z");
    const quote = normalizeServiceQuoteInput(
      {
        requestId: randomUUID(),
        expectedRequestVersion: 2,
        amountMinor: 12_345,
        currency: "KWD",
        descriptionAr: "تنفيذ الخدمة كاملة",
        descriptionEn: "Complete service delivery",
        expiresAt: "2026-08-22T12:00:00.000Z",
        clientQuoteId: randomUUID(),
      },
      now,
    );
    expect(quote.minorUnit).toBe(3);
    expect(quote.expiresAt.toISOString()).toBe("2026-08-22T12:00:00.000Z");
  });

  it("requires optimistic and idempotent quote responses", () => {
    expect(
      normalizeQuoteResponseInput({
        expectedVersion: 1,
        decision: "ACCEPT",
        clientActionId: randomUUID(),
      }),
    ).toMatchObject({ expectedVersion: 1, decision: "ACCEPT" });
    expect(() =>
      normalizeQuoteResponseInput({
        expectedVersion: 0,
        decision: "REJECT",
        clientActionId: randomUUID(),
      }),
    ).toThrowError("QUOTE_VERSION_CONFLICT");
  });

  it("requires both optimistic versions and an idempotency key for quote withdrawal", () => {
    const action = normalizeQuoteWithdrawalInput({
      expectedVersion: 2,
      expectedRequestVersion: 7,
      clientActionId: randomUUID(),
    });
    expect(action).toMatchObject({ expectedVersion: 2, expectedRequestVersion: 7 });
    expect(() =>
      normalizeQuoteWithdrawalInput({
        expectedVersion: 1,
        expectedRequestVersion: 0,
        clientActionId: randomUUID(),
      }),
    ).toThrowError("QUOTE_VERSION_CONFLICT");
    expect(() =>
      normalizeQuoteWithdrawalInput({
        expectedVersion: 1,
        expectedRequestVersion: 1,
        clientActionId: "not-a-uuid",
      }),
    ).toThrowError("INVALID_QUOTE");
  });
});
