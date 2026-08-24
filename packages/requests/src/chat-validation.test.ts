import { describe, expect, it } from "vitest";

import { RequestDomainError } from "./errors.js";
import {
  assertChatAttachmentMatchesContent,
  normalizeBoundedPage,
  normalizeChatMessageInput,
  receiptStatusRank,
} from "./chat-validation.js";

const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const clientMessageId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("chat message validation", () => {
  it("normalizes text, system, and action bodies without accepting attachments", () => {
    for (const contentType of ["TEXT", "SYSTEM", "ACTION"] as const) {
      expect(
        normalizeChatMessageInput({
          contentType,
          body: "  تحديث الطلب\n",
          clientMessageId,
        }),
      ).toMatchObject({ contentType, body: "تحديث الطلب", clientMessageId, metadata: {} });
      expect(() =>
        normalizeChatMessageInput({ contentType, body: "تحديث", attachmentId }),
      ).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE" }));
    }
  });

  it("requires an attachment for image, audio, and file messages while allowing a caption", () => {
    for (const contentType of ["IMAGE", "AUDIO", "FILE"] as const) {
      expect(
        normalizeChatMessageInput({ contentType, body: "مرفق الطلب", attachmentId }),
      ).toMatchObject({ contentType, body: "مرفق الطلب", attachmentId });
      expect(() => normalizeChatMessageInput({ contentType })).toThrowError(
        expect.objectContaining({ code: "MESSAGE_ATTACHMENT_REQUIRED" }),
      );
    }
  });

  it("rejects malformed identifiers, empty text, NUL bytes, and oversized metadata", () => {
    expect(() =>
      normalizeChatMessageInput({ contentType: "TEXT", body: "", clientMessageId }),
    ).toThrow(RequestDomainError);
    expect(() =>
      normalizeChatMessageInput({ contentType: "TEXT", body: "bad\0body" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE" }));
    expect(() =>
      normalizeChatMessageInput({ contentType: "FILE", attachmentId: "not-a-uuid" }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE_ATTACHMENT" }));
    expect(() =>
      normalizeChatMessageInput({
        contentType: "TEXT",
        body: "valid",
        metadata: { oversized: "x".repeat(17_000) },
      }),
    ).toThrowError(expect.objectContaining({ code: "INVALID_MESSAGE" }));
  });

  it("matches typed media to the detected attachment MIME type", () => {
    expect(() => assertChatAttachmentMatchesContent("IMAGE", "image/jpeg")).not.toThrow();
    expect(() => assertChatAttachmentMatchesContent("AUDIO", "audio/ogg")).not.toThrow();
    expect(() => assertChatAttachmentMatchesContent("FILE", "application/pdf")).not.toThrow();
    expect(() => assertChatAttachmentMatchesContent("IMAGE", "application/pdf")).toThrowError(
      expect.objectContaining({ code: "INVALID_MESSAGE_ATTACHMENT" }),
    );
    expect(() => assertChatAttachmentMatchesContent("AUDIO", "video/webm")).toThrowError(
      expect.objectContaining({ code: "INVALID_MESSAGE_ATTACHMENT" }),
    );
  });

  it("bounds pagination and preserves monotonic receipt ordering", () => {
    expect(normalizeBoundedPage(undefined, undefined, 50)).toEqual({
      page: 1,
      pageSize: 20,
      offset: 0,
    });
    expect(normalizeBoundedPage(3, 500, 100)).toEqual({
      page: 3,
      pageSize: 100,
      offset: 200,
    });
    expect(receiptStatusRank("SENT")).toBeLessThan(receiptStatusRank("DELIVERED"));
    expect(receiptStatusRank("DELIVERED")).toBeLessThan(receiptStatusRank("READ"));
  });
});
