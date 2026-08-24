import { Readable } from "node:stream";

import type { DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import type { MalwareScanner, ObjectStorage } from "@itqanak/storage";
import { describe, expect, it } from "vitest";

import { UnifiedAttachmentScanProcessor } from "./unified-attachment-scan-processor.js";

describe("unified attachment scanner admission", () => {
  it("does not claim unified work while ClamAV is unavailable", async () => {
    let databaseCalled = false;
    const database = (async () => {
      databaseCalled = true;
      return [];
    }) as unknown as DatabaseClient;
    const scanner: MalwareScanner = {
      mode: "clamav",
      checkReadiness: async () => "unavailable",
      scan: async () => ({ status: "ERROR" }),
    };
    const storage: ObjectStorage = {
      provider: "local",
      exists: async () => true,
      open: async () => Readable.from([]),
      put: async (key) => ({ key, checksumSha256: "a".repeat(64), contentLength: 1 }),
      remove: async () => undefined,
      signDownload: async () => "https://invalid.test/private",
    };
    const processor = new UnifiedAttachmentScanProcessor({
      database,
      storage,
      scanner,
      logger: createLogger({
        service: "unified-scan-test",
        environment: "test",
        level: "error",
        write: () => undefined,
      }),
      workerId: "unified-scan-test",
      maxAttempts: 5,
      scanTimeoutMs: 30_000,
    });

    await expect(processor.processBatch(1)).resolves.toBe(0);
    expect(databaseCalled).toBe(false);
  });
});
