import { describe, expect, it } from "vitest";

import type { FinanceError } from "./types.js";
import {
  amountToMinorUnits,
  minorUnitForCurrency,
  normalizeCreateFinanceDue,
  normalizeFinanceReason,
  normalizePaymentReference,
} from "./validation.js";

describe("finance validation", () => {
  it("converts supported currencies to exact integer minor units", () => {
    expect(amountToMinorUnits("125.50", "SAR")).toBe(12_550);
    expect(amountToMinorUnits("125.5", "AED")).toBe(12_550);
    expect(amountToMinorUnits("125.750", "KWD")).toBe(125_750);
    expect(minorUnitForCurrency("KWD")).toBe(3);
  });

  it("rejects rounding, scientific notation, zero and unsafe amounts", () => {
    for (const [amount, currency] of [
      ["1.001", "SAR"],
      ["1e3", "SAR"],
      ["0", "AED"],
      ["1000000.01", "SAR"],
    ] as const) {
      expect(() => amountToMinorUnits(amount, currency)).toThrowError(
        expect.objectContaining<Partial<FinanceError>>({ code: "INVALID_AMOUNT" }),
      );
    }
  });

  it("normalizes bilingual due content without accepting local ambiguous dates", () => {
    expect(
      normalizeCreateFinanceDue({
        requestNumber: " itq-2026-000001 ",
        titleAr: " دفعة الطلب ",
        titleEn: " Request payment ",
        amount: "10",
        currency: "SAR",
        dueAt: "2026-09-01T12:00:00+03:00",
      }),
    ).toMatchObject({
      requestNumber: "ITQ-2026-000001",
      amountMinor: 1_000,
      currency: "SAR",
      minorUnit: 2,
    });
    expect(() =>
      normalizeCreateFinanceDue({
        requestNumber: "ITQ-2026-000001",
        titleAr: "دفعة الطلب",
        titleEn: "Request payment",
        amount: "10",
        currency: "SAR",
        dueAt: "2026-09-01T12:00",
      }),
    ).toThrowError(expect.objectContaining<Partial<FinanceError>>({ code: "INVALID_DUE_AT" }));
  });

  it("rejects control characters in references and requires reasons", () => {
    expect(normalizePaymentReference(" bank-123 ")).toBe("bank-123");
    expect(() => normalizePaymentReference("bank\n123")).toThrowError(
      expect.objectContaining<Partial<FinanceError>>({ code: "INVALID_REFERENCE" }),
    );
    expect(() => normalizeFinanceReason(" ")).toThrowError(
      expect.objectContaining<Partial<FinanceError>>({ code: "INVALID_REASON" }),
    );
  });

  it("requires optional descriptions to remain bilingual", () => {
    expect(() =>
      normalizeCreateFinanceDue({
        requestNumber: "ITQ-2026-000001",
        titleAr: "دفعة الطلب",
        titleEn: "Request payment",
        descriptionAr: "وصف عربي فقط",
        amount: "10",
        currency: "SAR",
      }),
    ).toThrowError(expect.objectContaining<Partial<FinanceError>>({ code: "INVALID_TEXT" }));
  });
});
