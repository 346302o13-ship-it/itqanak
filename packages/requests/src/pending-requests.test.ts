import { describe, expect, it } from "vitest";

import {
  isStalePendingStatus,
  STALE_PENDING_THRESHOLD_DAYS,
  stalePendingRequestReason,
} from "./pending-requests.js";

describe("stale pending request detection", () => {
  it("flags only non-terminal states past their idle threshold", () => {
    expect(stalePendingRequestReason("DRAFT", 7)).toMatch(/مسودة/u);
    expect(stalePendingRequestReason("DRAFT", 6)).toBeUndefined();
    expect(stalePendingRequestReason("SUBMITTED", 30)).toMatch(/مُرسَل/u);
    expect(stalePendingRequestReason("SUBMITTED", 29)).toBeUndefined();
    expect(stalePendingRequestReason("QUOTED", 45)).toMatch(/التسعير/u);
  });

  it("never flags terminal or unknown states", () => {
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED", "PAID", "weird"]) {
      expect(stalePendingRequestReason(status, 999)).toBeUndefined();
      expect(isStalePendingStatus(status)).toBe(false);
    }
  });

  it("ignores non-finite ages", () => {
    expect(stalePendingRequestReason("DRAFT", Number.NaN)).toBeUndefined();
    expect(stalePendingRequestReason("DRAFT", Number.POSITIVE_INFINITY)).toBeUndefined();
  });

  it("keeps a draft threshold shorter than the review threshold", () => {
    expect(STALE_PENDING_THRESHOLD_DAYS.DRAFT).toBeLessThan(STALE_PENDING_THRESHOLD_DAYS.SUBMITTED);
  });
});
