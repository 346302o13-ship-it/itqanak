import { describe, expect, it } from "vitest";

import type { PlatformOperationalState } from "@itqanak/operations";

import {
  createMaintenanceStateReader,
  maintenanceApiResponse,
  maintenancePageResponse,
  maintenanceResponseForRequest,
  shouldBypassMaintenance,
} from "./maintenance-gate";

const state: PlatformOperationalState = {
  maintenanceEnabled: true,
  maintenanceMessageAr: "تحديث آمن للمنصة <script>alert(1)</script>",
  maintenanceMessageEn: "A safe platform update <script>alert(1)</script>",
  fileScanQueuePaused: false,
  fileScannerObservedState: "RUNNING",
  version: 2,
  updatedAt: new Date("2026-08-13T00:00:00.000Z"),
};

describe("maintenance request gate", () => {
  it("bypasses only the admin hostname, admin API, and health checks", () => {
    for (const request of [
      { pathname: "/ar", hostname: "admin.example.test", adminHostname: "admin.example.test" },
      {
        pathname: "/api/admin/operations",
        hostname: "app.example.test",
        adminHostname: "admin.example.test",
      },
      {
        pathname: "/api/health/ready",
        hostname: "app.example.test",
        adminHostname: "admin.example.test",
      },
    ]) {
      expect(shouldBypassMaintenance(request)).toBe(true);
    }
    expect(
      shouldBypassMaintenance({
        pathname: "/ar/services",
        hostname: "app.example.test",
        adminHostname: "admin.example.test",
      }),
    ).toBe(false);
    for (const pathname of ["/", "/ar/admin", "/api/student/requests", "/api/auth/login"]) {
      expect(
        shouldBypassMaintenance({
          pathname,
          hostname: "app.example.test",
          adminHostname: "admin.example.test",
        }),
      ).toBe(false);
    }
  });

  it("returns a bounded JSON 503 for public APIs", async () => {
    const response = maintenanceApiResponse(state, "en");
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("retry-after")).toBe("60");
    await expect(response.json()).resolves.toEqual({
      error: "MAINTENANCE_MODE",
      message: state.maintenanceMessageEn,
      retryAfterSeconds: 60,
    });
    const gated = await maintenanceResponseForRequest(
      {
        pathname: "/api/student/requests",
        hostname: "app.example.test",
        adminHostname: "admin.example.test",
      },
      async () => state,
    );
    expect(gated?.headers.get("content-type")).toContain("application/json");
  });

  it("returns a localized, non-cacheable 503 and escapes administrator text", async () => {
    const response = maintenancePageResponse(state, "ar");
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("content-language")).toBe("ar");
    const body = await response.text();
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).not.toContain("<script>alert(1)</script>");
  });

  it("fails open on state-read failure and gates only an enabled state", async () => {
    const request = {
      pathname: "/en/services",
      hostname: "app.example.test",
      adminHostname: "admin.example.test",
    };
    await expect(
      maintenanceResponseForRequest(request, async () => {
        throw new Error("database unavailable");
      }),
    ).resolves.toBeUndefined();
    await expect(maintenanceResponseForRequest(request, async () => state)).resolves.toMatchObject({
      status: 503,
    });
    await expect(
      maintenanceResponseForRequest(request, async () => ({ ...state, maintenanceEnabled: false })),
    ).resolves.toBeUndefined();
  });

  it("coalesces concurrent reads and refreshes only after the short TTL", async () => {
    let now = 1_000;
    let calls = 0;
    const reader = createMaintenanceStateReader(
      async () => {
        calls += 1;
        return state;
      },
      500,
      () => now,
    );
    await Promise.all([reader(), reader()]);
    await reader();
    expect(calls).toBe(1);
    now = 1_501;
    await reader();
    expect(calls).toBe(2);
  });
});
