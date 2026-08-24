import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import type { DatabaseClient } from "@itqanak/db";
import { createLogger } from "@itqanak/observability";
import type { MalwareScanner, ObjectStorage } from "@itqanak/storage";

import {
  AttachmentScanProcessor,
  dependencyRetryDelayMs,
  retryDelayMs,
  scanJobLeaseMs,
} from "./scan-processor.js";

describe("attachment scan retry", () => {
  it("uses bounded exponential backoff with injectable jitter", () => {
    expect(retryDelayMs(1, () => 0)).toBe(1_000);
    expect(retryDelayMs(2, () => 0)).toBe(2_000);
    expect(retryDelayMs(99, () => 0)).toBe(60_000);
    expect(retryDelayMs(1, () => 0.5)).toBeGreaterThanOrEqual(1_000);
  });

  it("keeps a claim longer than the maximum object-open and scan deadlines", () => {
    expect(scanJobLeaseMs(30_000)).toBe(300_000);
    expect(scanJobLeaseMs(300_000)).toBe(570_000);
  });

  it("uses a recovery-scale delay for dependency deferrals", () => {
    expect(dependencyRetryDelayMs(() => 0)).toBe(300_000);
    expect(dependencyRetryDelayMs(() => 0.999)).toBeGreaterThanOrEqual(359_000);
  });

  it("does not claim a job while the required scanner is unavailable", async () => {
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
    const processor = new AttachmentScanProcessor({
      database,
      storage,
      scanner,
      logger: createLogger({
        service: "scan-readiness-test",
        environment: "test",
        level: "error",
        write: () => undefined,
      }),
      workerId: "unavailable-scanner-test",
      maxAttempts: 5,
      scanTimeoutMs: 30_000,
    });

    await expect(processor.processBatch(1)).resolves.toBe(0);
    expect(databaseCalled).toBe(false);
  });
});
