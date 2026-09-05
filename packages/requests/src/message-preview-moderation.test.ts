import { describe, expect, it } from "vitest";

import { containsSevereAbuse, moderateMessagePreview } from "./message-preview-moderation.js";

describe("message preview moderation", () => {
  it("leaves ordinary messages untouched", () => {
    const text = "هل يمكن تسليم المشروع بعد يومين؟";
    expect(moderateMessagePreview(text)).toBe(text);
    expect(containsSevereAbuse(text)).toBe(false);
  });

  it("leaves an unrelated English message untouched", () => {
    const text = "Can you check my request status please?";
    expect(moderateMessagePreview(text)).toBe(text);
  });

  it("replaces a preview containing severe profanity with a neutral placeholder", () => {
    expect(moderateMessagePreview("تعرف تدور 🖕")).toBe("⚠️ رسالة تحتوي على لغة غير لائقة");
    expect(containsSevereAbuse("تعرف تدور 🖕")).toBe(true);
  });

  it("catches severe English profanity too", () => {
    expect(containsSevereAbuse("fuck you all")).toBe(true);
  });
});
