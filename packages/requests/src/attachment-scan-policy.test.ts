import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it, vi } from "vitest";

import { resolveNewAttachmentScanStatus } from "./attachment-scan-policy.js";

function config(nodeEnv: "development" | "test" | "production", mode: "disabled" | "clamav") {
  return {
    nodeEnv,
    fileScanning: {
      mode,
      clamavHost: "clamav",
      clamavPort: 3310,
      connectTimeoutMs: 3_000,
      scanTimeoutMs: 30_000,
      maxAttempts: 5,
    },
  } as const;
}

function databaseWithPause(paused: boolean): {
  database: DatabaseClient;
  query: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn(async () => [{ file_scan_queue_paused: paused }]);
  return { database: query as unknown as DatabaseClient, query };
}

describe("new attachment scan policy", () => {
  it("uses the development provenance without querying operational state", async () => {
    const { database, query } = databaseWithPause(false);
    await expect(
      resolveNewAttachmentScanStatus(database, config("test", "disabled")),
    ).resolves.toBe("SCAN_SKIPPED_DEVELOPMENT");
    expect(query).not.toHaveBeenCalled();
  });

  it("records an administrator skip while production scanning is off", async () => {
    const { database } = databaseWithPause(true);
    await expect(
      resolveNewAttachmentScanStatus(database, config("production", "clamav")),
    ).resolves.toBe("SCAN_SKIPPED_BY_ADMIN");
  });

  it("queues only uploads finalized while production scanning is on", async () => {
    const { database } = databaseWithPause(false);
    await expect(
      resolveNewAttachmentScanStatus(database, config("production", "clamav")),
    ).resolves.toBe("PENDING_SCAN");
  });
});
