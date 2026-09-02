import { describe, expect, it } from "vitest";

import { normalizeRetentionUpdate } from "./retention-service.js";
import { OperationalControlError } from "./types.js";

const base = {
  messageArchivalEnabled: false,
  messageRetentionDays: 30,
  expectedVersion: 1,
  confirmedCriticalAction: false,
} as const;

describe("normalizeRetentionUpdate", () => {
  it("accepts a disabled policy with a valid window", () => {
    expect(normalizeRetentionUpdate({ ...base, messageRetentionDays: 45 })).toEqual({
      ...base,
      messageRetentionDays: 45,
    });
  });

  it("requires confirmation to enable archival", () => {
    expect(() => normalizeRetentionUpdate({ ...base, messageArchivalEnabled: true })).toThrow(
      OperationalControlError,
    );
    expect(
      normalizeRetentionUpdate({
        ...base,
        messageArchivalEnabled: true,
        confirmedCriticalAction: true,
      }).messageArchivalEnabled,
    ).toBe(true);
  });

  it("rejects windows outside 7..3650 days", () => {
    expect(() => normalizeRetentionUpdate({ ...base, messageRetentionDays: 6 })).toThrow();
    expect(() => normalizeRetentionUpdate({ ...base, messageRetentionDays: 4000 })).toThrow();
    expect(() => normalizeRetentionUpdate({ ...base, messageRetentionDays: 30.5 })).toThrow();
  });

  it("rejects a non-positive expected version", () => {
    expect(() => normalizeRetentionUpdate({ ...base, expectedVersion: 0 })).toThrow();
  });
});
