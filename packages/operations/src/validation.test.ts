import { describe, expect, it } from "vitest";

import { OperationalControlError } from "./types.js";
import { normalizeOperationalMessage, normalizeOperationalUpdate } from "./validation.js";

describe("operational controls validation", () => {
  it("normalizes bilingual plain text and line endings", () => {
    expect(normalizeOperationalMessage("  Maintenance\r\nmessage  ")).toBe("Maintenance\nmessage");
  });

  it("rejects unsafe control characters and unconfirmed critical states", () => {
    expect(() => normalizeOperationalMessage("Maintenance\u0000message")).toThrow(
      OperationalControlError,
    );
    expect(() =>
      normalizeOperationalUpdate({
        maintenanceEnabled: true,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: false,
        expectedVersion: 1,
        confirmedCriticalAction: false,
      }),
    ).toThrowError(expect.objectContaining({ code: "CONFIRMATION_REQUIRED" }));
  });

  it("permits a confirmed pause without changing the safety meaning", () => {
    expect(
      normalizeOperationalUpdate({
        maintenanceEnabled: false,
        maintenanceMessageAr: "رسالة صيانة صالحة للزائر.",
        maintenanceMessageEn: "A valid maintenance message.",
        fileScanQueuePaused: true,
        expectedVersion: 2,
        confirmedCriticalAction: true,
      }),
    ).toMatchObject({ fileScanQueuePaused: true, expectedVersion: 2 });
  });
});
