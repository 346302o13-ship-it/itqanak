import { describe, expect, it } from "vitest";

import {
  financePaymentMethodLabel,
  financeStatusLabel,
  formatFinanceAmount,
} from "./finance-presenters.js";

describe("finance presenters", () => {
  it("formats each currency using its exact minor unit", () => {
    expect(formatFinanceAmount(12_550, "SAR", 2, "en")).toContain("125.50");
    expect(formatFinanceAmount(125_750, "KWD", 3, "en")).toContain("125.750");
  });

  it("provides Arabic and English statuses and payment methods", () => {
    expect(financeStatusLabel("UNPAID", "ar")).toBe("غير مدفوع");
    expect(financeStatusLabel("PAID", "en")).toBe("Paid");
    expect(financePaymentMethodLabel("BANK_TRANSFER", "ar")).toBe("تحويل بنكي");
  });
});
