import { describe, expect, it } from "vitest";

import { nextBackoffDelay, waitFor } from "./backoff.js";

describe("worker backoff", () => {
  it("bounds retry delays", () => {
    expect(nextBackoffDelay(0, 1_000)).toBe(1_000);
    expect(nextBackoffDelay(20, 5_000)).toBeLessThanOrEqual(5_000);
  });

  it("unblocks a wait during graceful shutdown", async () => {
    const controller = new AbortController();
    const waiting = waitFor(10_000, controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBeUndefined();
  });
});
