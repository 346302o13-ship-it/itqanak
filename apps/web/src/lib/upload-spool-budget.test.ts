import { describe, expect, it } from "vitest";

import { RequestDomainError } from "@itqanak/requests";

import { UploadConcurrencyBudget, UploadSpoolBudget } from "./upload-spool-budget";

describe("OOXML upload spool admission", () => {
  it("bounds concurrent reserved bytes and releases idempotently", () => {
    const budget = new UploadSpoolBudget(10);
    const releaseFirst = budget.reserve(6);
    expect(budget.usedBytes).toBe(6);
    expect(budget.activeReservations).toBe(1);
    try {
      budget.reserve(5);
      throw new Error("Expected the spool reservation to be rejected.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RequestDomainError);
      expect((error as RequestDomainError).code).toBe("STORAGE_UNAVAILABLE");
    }
    const releaseSecond = budget.reserve(4);
    expect(budget.usedBytes).toBe(10);
    releaseFirst();
    releaseFirst();
    expect(budget.usedBytes).toBe(4);
    releaseSecond();
    expect(budget.usedBytes).toBe(0);
    expect(budget.activeReservations).toBe(0);
  });

  it("rejects invalid reservations without changing the budget", () => {
    const budget = new UploadSpoolBudget(10);
    for (const value of [0, -1, 1.5, Number.NaN]) {
      expect(() => budget.reserve(value)).toThrow(RequestDomainError);
    }
    expect(budget.usedBytes).toBe(0);
  });

  it("also bounds many small OOXML reservations", () => {
    const budget = new UploadSpoolBudget(100, 2);
    const releaseFirst = budget.reserve(1);
    const releaseSecond = budget.reserve(1);
    expect(() => budget.reserve(1)).toThrow(RequestDomainError);
    releaseFirst();
    const releaseThird = budget.reserve(1);
    releaseSecond();
    releaseThird();
    expect(budget.activeReservations).toBe(0);
  });

  it("bounds all active upload streams process-wide", () => {
    const budget = new UploadConcurrencyBudget(1);
    const release = budget.reserve();
    expect(budget.active).toBe(1);
    expect(() => budget.reserve()).toThrow(RequestDomainError);
    release();
    release();
    expect(budget.active).toBe(0);
  });
});
