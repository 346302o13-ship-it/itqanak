import { describe, expect, it } from "vitest";

import { maskEmailForDisplay, normalizeDisplayName, normalizeEmail } from "./identity.js";

describe("identity normalization", () => {
  it("trims and case-folds email identities without provider-specific alias rewrites", () => {
    expect(normalizeEmail("  Student+Course@Example.TEST ")).toBe("student+course@example.test");
  });

  it("rejects malformed email identities", () => {
    expect(() => normalizeEmail("not-an-email")).toThrow();
    expect(() => normalizeEmail("a@b")).toThrow();
  });

  it("normalizes display names but rejects control characters", () => {
    expect(normalizeDisplayName("  طالب اختبار  ")).toBe("طالب اختبار");
    expect(() => normalizeDisplayName("A\u0000B")).toThrow();
    expect(() => normalizeDisplayName("A")).toThrow();
  });

  it("masks email addresses for UI confirmation messages", () => {
    expect(maskEmailForDisplay("student@example.test")).toBe("s***@example.test");
    expect(maskEmailForDisplay("invalid-email")).toBe("[masked]");
  });
});
