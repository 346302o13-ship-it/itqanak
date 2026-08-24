import { describe, expect, it } from "vitest";

import {
  educationalGuideSupportHref,
  educationalGuideTopics,
  findEducationalGuideAnswer,
  normalizeGuideQuery,
} from "./educational-guide";

describe("educational guide", () => {
  it("normalizes common Arabic variants and punctuation", () => {
    expect(normalizeGuideQuery("  تَأْكِيدُ رَقْمِ الجَوَّال! ")).toBe("تاكيد رقم الجوال");
  });

  it("matches Arabic questions to a curated answer", () => {
    const answer = findEducationalGuideAnswer("ar", "student", "كيف أرسل ملفات وصور للطلب؟");
    expect(answer?.id).toBe("files-privacy");
    expect(answer?.action?.href).toBe("/ar/student/requests/new");
  });

  it("matches English questions without a network dependency", () => {
    const answer = findEducationalGuideAnswer("en", "public", "I forgot my password");
    expect(answer?.id).toBe("password-support");
    expect(answer?.action?.external).toBe(true);
  });

  it("returns no guessed answer for an unrelated question", () => {
    expect(findEducationalGuideAnswer("ar", "public", "ما حالة الطقس؟")).toBeUndefined();
  });

  it("uses audience-specific local actions", () => {
    const publicRequest = educationalGuideTopics("en", "public").find(
      (topic) => topic.id === "request-flow",
    );
    const studentRequest = educationalGuideTopics("en", "student").find(
      (topic) => topic.id === "request-flow",
    );
    expect(publicRequest?.action?.href).toBe("/en/auth/register");
    expect(studentRequest?.action?.href).toBe("/en/student/requests/new");
  });

  it("keeps user text out of the fixed WhatsApp fallback", () => {
    const href = educationalGuideSupportHref("ar");
    expect(href).toContain("wa.me/966564202263");
    expect(decodeURIComponent(href)).not.toContain("سؤال المستخدم");
  });
});
