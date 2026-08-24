import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import { FinanceService } from "./service.js";

function principal(
  roles: AuthenticatedPrincipal["roles"],
  permissions: AuthenticatedPrincipal["permissions"],
): AuthenticatedPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    displayName: "Finance tester",
    roles,
    permissions,
    status: "ACTIVE",
  };
}

function rejectingDatabase(statements: string[]): DatabaseClient {
  const query = async (strings: TemplateStringsArray): Promise<readonly unknown[]> => {
    statements.push(strings.join("?"));
    return [];
  };
  Object.assign(query, {
    unsafe: async (statement: string) => {
      statements.push(statement);
      return [];
    },
  });
  return query as unknown as DatabaseClient;
}

describe("FinanceService authorization", () => {
  it("refuses student reads without the exact ownership permission", async () => {
    const statements: string[] = [];
    const service = new FinanceService({ database: rejectingDatabase(statements) });
    await expect(service.listStudentDues(principal(["STUDENT"], []))).rejects.toThrow(
      "required permission",
    );
    expect(statements).toHaveLength(0);
  });

  it("does not let an ADMIN role imply finance read or management", async () => {
    const statements: string[] = [];
    const service = new FinanceService({ database: rejectingDatabase(statements) });
    const admin = principal(["ADMIN"], ["admin.dashboard.view"]);
    await expect(service.listAdminDues(admin)).rejects.toThrow("required permission");
    await expect(
      service.createDue(admin, {
        requestNumber: "ITQ-2026-000001",
        titleAr: "مستحق الطلب",
        titleEn: "Request due",
        amount: "10",
        currency: "SAR",
      }),
    ).rejects.toThrow("required permission");
    expect(statements).toHaveLength(0);
  });

  it("keeps reports behind a permission separate from administrative reads", async () => {
    const statements: string[] = [];
    const service = new FinanceService({ database: rejectingDatabase(statements) });
    await expect(
      service.getAdminReport(principal(["ADMIN"], ["admin.dashboard.view", "admin.finance.read"])),
    ).rejects.toThrow("required permission");
    expect(statements).toHaveLength(0);
  });

  it("requires an evidence reference before recording any manual payment", async () => {
    const statements: string[] = [];
    const service = new FinanceService({ database: rejectingDatabase(statements) });
    await expect(
      service.recordPayment(
        principal(["ADMIN"], ["admin.dashboard.view", "admin.finance.manage"]),
        "33333333-3333-4333-8333-333333333333",
        { expectedVersion: 1, method: "CASH" },
      ),
    ).rejects.toMatchObject({ code: "INVALID_REFERENCE" });
    expect(statements).toHaveLength(0);
  });
});
