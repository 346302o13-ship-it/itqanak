import { describe, expect, it, vi } from "vitest";

import { runPeriodicHeartbeat } from "./heartbeat.js";

describe("worker periodic heartbeat", () => {
  it("continues while unrelated work is blocked and stops on abort", async () => {
    const controller = new AbortController();
    const heartbeat = vi.fn(async () => undefined);
    const loop = runPeriodicHeartbeat({
      intervalMs: 5,
      signal: controller.signal,
      heartbeat,
      onFailure: () => undefined,
    });
    const blockedWork = new Promise<void>(() => undefined);
    void blockedWork;

    await vi.waitFor(() => expect(heartbeat).toHaveBeenCalled());
    controller.abort();
    await expect(loop).resolves.toBeUndefined();
  });

  it("reports a failed heartbeat and retries until shutdown", async () => {
    const controller = new AbortController();
    const onFailure = vi.fn(() => controller.abort());
    const loop = runPeriodicHeartbeat({
      intervalMs: 1,
      signal: controller.signal,
      heartbeat: async () => {
        throw new Error("dependency unavailable");
      },
      onFailure,
    });

    await expect(loop).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
