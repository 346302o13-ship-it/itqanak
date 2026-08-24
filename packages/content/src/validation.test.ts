import { describe, expect, it } from "vitest";

import { ContentBlockError, type ContentBlockFields } from "./types.js";
import { assertContentBlockId, normalizeContentBlockFields } from "./validation.js";

const validFields: ContentBlockFields = {
  slug: "semester-announcement",
  target: "LANDING",
  variant: "ANNOUNCEMENT",
  titleAr: "تنبيه مهم",
  titleEn: "Important notice",
  bodyAr: "تم تحديث الخدمات المتاحة لهذا الفصل.",
  bodyEn: "Available services have been updated for this term.",
  actionLabelAr: "استعرض الخدمات",
  actionLabelEn: "Browse services",
  actionHref: "/ar/services",
  active: true,
  sortOrder: 20,
};

describe("managed content validation", () => {
  it("normalizes safe bilingual plain-text content", () => {
    expect(
      normalizeContentBlockFields({ ...validFields, slug: " Semester-Announcement " }),
    ).toEqual(validFields);
  });

  it.each([
    "javascript:alert(1)",
    "//evil.example",
    "http://example.com",
    "https://a:b@example.com",
  ])("rejects an unsafe action URL: %s", (actionHref) => {
    expect(() => normalizeContentBlockFields({ ...validFields, actionHref })).toThrow(
      ContentBlockError,
    );
  });

  it("requires all three localized action fields together", () => {
    expect(() => normalizeContentBlockFields({ ...validFields, actionLabelEn: null })).toThrowError(
      "INVALID_ACTION",
    );
  });

  it("rejects identifiers before they reach SQL", () => {
    expect(() => assertContentBlockId("../../etc/passwd")).toThrowError("INVALID_ID");
    expect(assertContentBlockId("11111111-1111-4111-8111-111111111111")).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });
});
