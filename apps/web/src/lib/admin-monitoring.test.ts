import { describe, expect, it } from "vitest";

import {
  hostUsageHealth,
  maskOperationalPhone,
  parseMemInfo,
  toHostUsage,
  whatsappHealth,
  workerHealth,
} from "./admin-monitoring-presenters";

describe("admin monitoring presenters", () => {
  it("masks an operational recipient without exposing the full phone number", () => {
    expect(maskOperationalPhone("+966570871410")).toBe("+966•••••1410");
    expect(maskOperationalPhone("not-a-phone")).toBeUndefined();
    expect(maskOperationalPhone(undefined)).toBeUndefined();
  });

  it("classifies worker heartbeat staleness", () => {
    const capturedAt = new Date("2026-08-20T12:00:00.000Z");
    expect(workerHealth(capturedAt, new Date("2026-08-20T11:59:30.000Z"))).toBe("HEALTHY");
    expect(workerHealth(capturedAt, new Date("2026-08-20T11:58:30.000Z"))).toBe("WARNING");
    expect(workerHealth(capturedAt, new Date("2026-08-20T11:50:00.000Z"))).toBe("CRITICAL");
    expect(workerHealth(capturedAt, undefined)).toBe("CRITICAL");
  });

  it("does not call an enabled but failing Meta channel healthy", () => {
    expect(
      whatsappHealth({
        mode: "enabled",
        configured: false,
        delivered24Hours: 0,
        queued: 0,
        deadLetter: 0,
      }),
    ).toBe("CRITICAL");
    expect(
      whatsappHealth({
        mode: "enabled",
        configured: true,
        delivered24Hours: 0,
        queued: 0,
        deadLetter: 1,
      }),
    ).toBe("CRITICAL");
    expect(
      whatsappHealth({
        mode: "enabled",
        configured: true,
        delivered24Hours: 2,
        queued: 1,
        deadLetter: 0,
      }),
    ).toBe("WARNING");
    expect(
      whatsappHealth({
        mode: "enabled",
        configured: true,
        delivered24Hours: 0,
        queued: 0,
        deadLetter: 0,
      }),
    ).toBe("UNKNOWN");
    expect(
      whatsappHealth({
        mode: "enabled",
        configured: true,
        delivered24Hours: 2,
        queued: 0,
        deadLetter: 0,
      }),
    ).toBe("HEALTHY");
  });

  it("never presents a dry run as live Meta health", () => {
    expect(
      whatsappHealth({
        mode: "dry-run",
        configured: true,
        delivered24Hours: 4,
        queued: 0,
        deadLetter: 0,
      }),
    ).toBe("UNKNOWN");
  });

  it("grades host disk / memory fill as a traffic light", () => {
    expect(hostUsageHealth(0.5)).toBe("HEALTHY");
    expect(hostUsageHealth(0.85)).toBe("WARNING");
    expect(hostUsageHealth(0.95)).toBe("CRITICAL");
    expect(hostUsageHealth(Number.NaN)).toBe("UNKNOWN");
  });

  it("reads MemTotal and MemAvailable out of /proc/meminfo", () => {
    const raw = [
      "MemTotal:        3911560 kB",
      "MemFree: 354620 kB",
      "MemAvailable:    1564552 kB",
    ].join("\n");
    expect(parseMemInfo(raw)).toEqual({
      totalBytes: 3_911_560 * 1024,
      availableBytes: 1_564_552 * 1024,
    });
    expect(parseMemInfo("MemFree: 500 kB")).toBeUndefined();
    expect(parseMemInfo("garbage")).toBeUndefined();
  });

  it("turns totals into a used ratio and clamps availability", () => {
    expect(toHostUsage(100, 25)).toEqual({
      totalBytes: 100,
      usedBytes: 75,
      availableBytes: 25,
      usedRatio: 0.75,
    });
    expect(toHostUsage(100, 250)?.usedRatio).toBe(0);
    expect(toHostUsage(0, 0)).toBeUndefined();
  });
});
