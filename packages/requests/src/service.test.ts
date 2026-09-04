import { describe, expect, it } from "vitest";

import { sanitizeUtmValue } from "./service.js";

describe("sanitizeUtmValue", () => {
  it("passes through a normal value unchanged", () => {
    expect(sanitizeUtmValue("google", 80)).toBe("google");
    expect(sanitizeUtmValue("back_to_school-2026", 80)).toBe("back_to_school-2026");
  });

  it("returns null for null/undefined, never throws", () => {
    expect(sanitizeUtmValue(null, 80)).toBeNull();
    expect(sanitizeUtmValue(undefined, 80)).toBeNull();
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeUtmValue("  cpc  ", 80)).toBe("cpc");
  });

  it("strips control characters instead of throwing", () => {
    // Built with fromCharCode rather than a literal escape so the raw NUL
    // byte never has to round-trip through this source file.
    const withNul = `cam${String.fromCharCode(0)}paign`;
    expect(sanitizeUtmValue(withNul, 80)).toBe("campaign");
  });

  it("becomes null when only whitespace/control characters remain", () => {
    expect(sanitizeUtmValue("     ", 80)).toBeNull();
    expect(sanitizeUtmValue(String.fromCharCode(0, 1, 2), 80)).toBeNull();
  });

  it("caps to the given length", () => {
    expect(sanitizeUtmValue("a".repeat(200), 80)).toBe("a".repeat(80));
  });

  it("keeps non-Latin scripts (Arabic campaign names) intact", () => {
    expect(sanitizeUtmValue("حملة_رمضان", 80)).toBe("حملة_رمضان");
  });
});
