import { AuthorizationError, CsrfError } from "@itqanak/auth";
import { FinanceError } from "@itqanak/finance";
import { describe, expect, it } from "vitest";

import { financeErrorStatus } from "./finance-http.js";

describe("finance HTTP errors", () => {
  it("maps authorization, absence, validation and concurrency without leaking details", () => {
    expect(financeErrorStatus(new AuthorizationError(["admin.finance.manage"]))).toBe(403);
    expect(financeErrorStatus(new CsrfError())).toBe(403);
    expect(financeErrorStatus(new FinanceError("DUE_NOT_FOUND"))).toBe(404);
    expect(financeErrorStatus(new FinanceError("VERSION_CONFLICT"))).toBe(409);
    expect(financeErrorStatus(new FinanceError("INVALID_ID"))).toBe(400);
    expect(financeErrorStatus(new FinanceError("INVALID_AMOUNT"))).toBe(422);
    expect(financeErrorStatus(new Error("database details"))).toBe(500);
  });
});
