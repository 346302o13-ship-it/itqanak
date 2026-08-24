import { describe, expect, it, vi } from "vitest";

import type { RateLimiter } from "@itqanak/auth";

import { enforceMessageSendRateLimit } from "./message-rate-limit";

describe("message sending rate limit", () => {
  it("uses the bounded per-user rule and permits disabled limiting", async () => {
    const enforce = vi.fn<RateLimiter["enforce"]>().mockResolvedValue({
      allowed: true,
      remaining: 29,
    });
    await expect(enforceMessageSendRateLimit({ enforce }, "user-id")).resolves.toBeUndefined();
    expect(enforce).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "message-send-user", limit: 30, windowSeconds: 60 }),
      "user-id",
    );
    await expect(enforceMessageSendRateLimit(undefined, "user-id")).resolves.toBeUndefined();
  });

  it("rejects an exhausted account quota", async () => {
    const limiter: RateLimiter = {
      enforce: vi.fn().mockResolvedValue({ allowed: false, remaining: 0 }),
    };
    await expect(enforceMessageSendRateLimit(limiter, "user-id")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
