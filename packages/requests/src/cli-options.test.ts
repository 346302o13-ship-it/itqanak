import { describe, expect, it } from "vitest";

import { requestCliSafetyError, requestCliUsage } from "./cli-options.js";

describe("request operations CLI safety", () => {
  it("rejects a dry-run flag for the mutating scan command", () => {
    expect(requestCliSafetyError("scan-pending", ["scan-pending", "--dry-run"])).toContain(
      "--dry-run is rejected",
    );
  });

  it("allows an explicit dry-run only for commands that stay read-only", () => {
    expect(
      requestCliSafetyError("storage-cleanup-orphans", ["storage-cleanup-orphans", "--dry-run"]),
    ).toBeUndefined();
    expect(
      requestCliSafetyError("storage-verify", ["storage-verify", "--dry-run"]),
    ).toBeUndefined();
  });

  it("documents that scan-pending has no dry-run mode", () => {
    expect(requestCliUsage).toContain("itqanak-requests scan-pending");
    expect(requestCliUsage).toContain("rejects --dry-run");
  });
});
