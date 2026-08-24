import { describe, expect, it } from "vitest";

import {
  assertSubmissionKey,
  formatRequestNumber,
  generateSubmissionKey,
  isRequestNumber,
  isSubmissionKey,
  normalizeSubmissionKey,
} from "./request-identifiers.js";

describe("request identifiers", () => {
  it("formats the database sequence without truncating large values", () => {
    expect(formatRequestNumber(1, 2026)).toBe("ITQ-2026-000001");
    expect(formatRequestNumber(1_000_000n, new Date("2027-01-01T00:00:00Z"))).toBe(
      "ITQ-2027-1000000",
    );
  });

  it("rejects zero, unsafe sequences, and malformed request numbers", () => {
    expect(() => formatRequestNumber(0, 2026)).toThrow(RangeError);
    expect(() => formatRequestNumber(Number.MAX_SAFE_INTEGER + 1, 2026)).toThrow(RangeError);
    expect(isRequestNumber("ITQ-2026-000001")).toBe(true);
    expect(isRequestNumber("ITQ-2026-000000")).toBe(false);
    expect(isRequestNumber("1")).toBe(false);
  });

  it("generates and normalizes UUID submission keys", () => {
    const generated = generateSubmissionKey();
    expect(isSubmissionKey(generated)).toBe(true);
    expect(normalizeSubmissionKey(generated.toUpperCase())).toBe(generated);
    expect(() => assertSubmissionKey("browser-counter-1")).toThrow(TypeError);
  });
});
