import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import { describe, expect, it, vi } from "vitest";

import { OutboxRetentionWorkLoop } from "./outbox.js";

type Call = { readonly sql: string; readonly values: readonly unknown[] };

/**
 * Minimal postgres.js tagged-template stand-in: records each query and returns
 * `{ count }` from a per-call resolver.
 */
function fakeDatabase(resolve: (call: Call) => number) {
  const calls: Call[] = [];
  const database = ((strings: TemplateStringsArray, ...values: readonly unknown[]) => {
    const sql = strings.join("?").replace(/\s+/gu, " ").trim();
    const call: Call = { sql, values };
    calls.push(call);
    return Promise.resolve(Object.assign([] as unknown[], { count: resolve(call) }));
  }) as unknown as DatabaseClient;
  return { database, calls };
}

function fakeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
    log: vi.fn(),
    time: vi.fn(),
    timeAsync: vi.fn(),
    service: "worker",
    environment: "test",
  } as unknown as Logger;
}

const isTerminal = (sql: string) => sql.includes("'DELIVERED', 'DEAD_LETTER'");

describe("OutboxRetentionWorkLoop", () => {
  it("prunes terminal and unclaimed rows and logs the totals", async () => {
    const { database, calls } = fakeDatabase((call) => (isTerminal(call.sql) ? 3 : 5));
    const logger = fakeLogger();
    const loop = new OutboxRetentionWorkLoop(database, logger, {
      batchSize: 10,
      now: () => 1_000,
    });

    await loop.poll();

    expect(calls).toHaveLength(2);
    expect(calls[0]?.values).toContain(30); // terminalRetentionDays default
    expect(calls[1]?.values).toContain(90); // unclaimedRetentionDays default
    expect(logger.info).toHaveBeenCalledWith("outbox_retention_swept", {
      terminal: 3,
      unclaimed: 5,
    });
  });

  it("keeps deleting in batches until a short pass and respects the batch cap", async () => {
    const { database, calls } = fakeDatabase((call) => (isTerminal(call.sql) ? 10 : 0));
    const loop = new OutboxRetentionWorkLoop(database, fakeLogger(), {
      batchSize: 10,
      maxBatchesPerSweep: 4,
      now: () => 0,
    });

    await loop.poll();

    const terminalCalls = calls.filter((call) => isTerminal(call.sql));
    const unclaimedCalls = calls.filter((call) => !isTerminal(call.sql));
    expect(terminalCalls).toHaveLength(4); // capped, never saw a short pass
    expect(unclaimedCalls).toHaveLength(1); // 0 < batchSize, stop after one
  });

  it("does not sweep again before the minimum interval elapses", async () => {
    let clock = 5_000;
    const { database, calls } = fakeDatabase(() => 0);
    const loop = new OutboxRetentionWorkLoop(database, fakeLogger(), {
      minIntervalMs: 60_000,
      now: () => clock,
    });

    await loop.poll();
    const afterFirst = calls.length;
    clock += 30_000;
    await loop.poll();
    expect(calls.length).toBe(afterFirst);
    clock += 31_000;
    await loop.poll();
    expect(calls.length).toBeGreaterThan(afterFirst);
  });

  it("swallows a database error and reports it without throwing", async () => {
    const logger = fakeLogger();
    const database = (() =>
      Promise.reject(new TypeError("connection reset"))) as unknown as DatabaseClient;
    const loop = new OutboxRetentionWorkLoop(database, logger, { now: () => 0 });

    await expect(loop.poll()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith("outbox_retention_failed", {
      errorName: "TypeError",
    });
  });
});
