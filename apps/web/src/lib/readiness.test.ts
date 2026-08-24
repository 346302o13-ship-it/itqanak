import { describe, expect, it } from "vitest";

import {
  checkFileScannerReadiness,
  checkObjectStorageReadiness,
  plannedFileScannerReadiness,
} from "./readiness.js";

describe("object-storage readiness", () => {
  it("accepts an absent probe key when the private storage is reachable", async () => {
    await expect(
      checkObjectStorageReadiness({
        driver: "local",
        localPath: "/tmp",
      }),
    ).resolves.toBe(true);
  });
});

describe("file-scanner readiness", () => {
  it("keeps development ready with an explicit disabled status", async () => {
    await expect(
      checkFileScannerReadiness({
        mode: "disabled",
        clamavHost: "clamav",
        clamavPort: 3310,
        connectTimeoutMs: 50,
        scanTimeoutMs: 50,
        maxAttempts: 5,
      }),
    ).resolves.toBe("disabled-development");
  });

  it("reports a safe unavailable status without exposing connection details", async () => {
    await expect(
      checkFileScannerReadiness({
        mode: "clamav",
        clamavHost: "127.0.0.1",
        clamavPort: 1,
        connectTimeoutMs: 50,
        scanTimeoutMs: 50,
        maxAttempts: 5,
      }),
    ).resolves.toBe("unavailable");
  });

  it("keeps readiness healthy when the host reconciler confirms an intentional stop", () => {
    expect(
      plannedFileScannerReadiness("clamav", {
        maintenanceEnabled: false,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: true,
        fileScannerObservedState: "STOPPED",
        version: 2,
        updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    ).toBe("paused-stopped");
    expect(
      plannedFileScannerReadiness("clamav", {
        maintenanceEnabled: false,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: true,
        fileScannerObservedState: "UNKNOWN",
        version: 2,
        updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    ).toBe("disabled-by-admin");
    expect(
      plannedFileScannerReadiness("clamav", {
        maintenanceEnabled: false,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: false,
        fileScannerObservedState: "STOPPED",
        version: 3,
        updatedAt: new Date("2026-08-13T00:00:00.000Z"),
      }),
    ).toBeUndefined();
  });
});
