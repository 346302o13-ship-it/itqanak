import { describe, expect, it } from "vitest";

import {
  maskEmailForDisplay,
  maskPhoneForDisplay,
  normalizeDisplayName,
  normalizeEmail,
  normalizePhone,
} from "./identity.js";

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

  it("normalizes Saudi mobile numbers from local, international, and Arabic-digit input", () => {
    expect(normalizePhone("056 420 2263", "SA")).toEqual({
      e164: "+966564202263",
      countryCode: "SA",
    });
    expect(normalizePhone("00966-56-420-2263")).toEqual({
      e164: "+966564202263",
      countryCode: "SA",
    });
    expect(normalizePhone("٠٥٦٤٢٠٢٢٦٣", "SA").e164).toBe("+966564202263");
  });

  it("normalizes UAE and Kuwait mobile numbers and rejects mismatched countries", () => {
    expect(normalizePhone("050 123 4567", "AE")).toEqual({
      e164: "+971501234567",
      countryCode: "AE",
    });
    expect(normalizePhone("5123 4567", "KW")).toEqual({
      e164: "+96551234567",
      countryCode: "KW",
    });
    expect(() => normalizePhone("+971501234567", "SA")).toThrow("PHONE_COUNTRY_MISMATCH");
    expect(() => normalizePhone("12345678", "KW")).toThrow("PHONE_INVALID");
  });

  it("accepts only supported E.164 numbers without a country and masks them", () => {
    expect(normalizePhone("+965 9123 4567").countryCode).toBe("KW");
    expect(() => normalizePhone("0501234567")).toThrow("PHONE_COUNTRY_REQUIRED");
    expect(() => normalizePhone("+12025550123")).toThrow("PHONE_COUNTRY_MISMATCH");
    expect(maskPhoneForDisplay("+966564202263")).toBe("+966•••••2263");
  });
});
