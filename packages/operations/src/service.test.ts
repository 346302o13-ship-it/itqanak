import type { AuthenticatedPrincipal } from "@itqanak/auth";
import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import { PlatformOperationsService } from "./service.js";

function principal(permissions: AuthenticatedPrincipal["permissions"]): AuthenticatedPrincipal {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    displayName: "Operations administrator",
    roles: ["ADMIN"],
    permissions,
    status: "ACTIVE",
  };
}

function queryDatabase(statements: string[]): DatabaseClient {
  const query = async (strings: TemplateStringsArray): Promise<readonly unknown[]> => {
    statements.push(strings.join("?"));
    return [];
  };
  return query as unknown as DatabaseClient;
}

describe("PlatformOperationsService authorization", () => {
  it("refuses administrative reads without the explicit permission", async () => {
    const statements: string[] = [];
    const service = new PlatformOperationsService({ database: queryDatabase(statements) });
    await expect(service.getAdminState(principal(["admin.dashboard.view"]))).rejects.toThrow(
      "required permission",
    );
    expect(statements).toHaveLength(0);
  });

  it("does not treat read access as permission to change runtime state", async () => {
    const statements: string[] = [];
    const service = new PlatformOperationsService({ database: queryDatabase(statements) });
    await expect(
      service.updateState(principal(["admin.dashboard.view", "admin.operations.read"]), {
        maintenanceEnabled: false,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: false,
        expectedVersion: 1,
        confirmedCriticalAction: false,
      }),
    ).rejects.toThrow("required permission");
    expect(statements).toHaveLength(0);
  });
});
