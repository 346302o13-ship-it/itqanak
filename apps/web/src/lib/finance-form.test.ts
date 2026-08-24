import { describe, expect, it } from "vitest";

import {
  createFinanceDueFromForm,
  financeVersionFromForm,
  parseFinanceListQuery,
} from "./finance-form.js";

describe("finance form parsing", () => {
  it("turns a local administrator date into an explicit Saudi offset", () => {
    const form = new FormData();
    form.set("requestNumber", "ITQ-2026-000001");
    form.set("titleAr", "مستحق الطلب");
    form.set("titleEn", "Request due");
    form.set("amount", "12.50");
    form.set("currency", "SAR");
    form.set("dueAt", "2026-09-10T14:30");
    expect(createFinanceDueFromForm(form)).toMatchObject({
      requestNumber: "ITQ-2026-000001",
      dueAt: "2026-09-10T14:30:00+03:00",
    });
  });

  it("ignores malformed filters and keeps bounded search input", () => {
    expect(
      parseFinanceListQuery({
        page: "not-a-page",
        q: " x ",
        status: "BROKEN",
        currency: "USD",
      }),
    ).toEqual({ search: "x" });
    expect(parseFinanceListQuery({ page: "2", status: "PAID", currency: "KWD" })).toEqual({
      page: 2,
      status: "PAID",
      currency: "KWD",
    });
  });

  it("rejects non-canonical optimistic versions", () => {
    const form = new FormData();
    form.set("expectedVersion", "1e3");
    expect(financeVersionFromForm(form)).toBeNaN();
  });
});
