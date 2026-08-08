import { describe, expect, it, vi } from "vitest";

import {
  hashRateLimitSubject,
  RedisRateLimiter,
  requireWithinRateLimit,
  type RateLimiter,
  type RateLimitRule,
} from "./rate-limit.js";

const rule: RateLimitRule = { scope: "login-ip", limit: 2, windowSeconds: 60 };

describe("Redis authentication rate limiter", () => {
  it("hashes subjects before constructing the Redis key", async () => {
    const subject = "203.0.113.42";
    const evaluate = vi.fn().mockResolvedValue([1, 60]);
    const limiter = new RedisRateLimiter({ eval: evaluate } as never, true);

    await expect(limiter.enforce(rule, subject)).resolves.toEqual({ allowed: true, remaining: 1 });
    expect(hashRateLimitSubject(subject)).toMatch(/^[a-f0-9]{64}$/u);
    expect(evaluate).toHaveBeenCalledWith(
      expect.any(String),
      1,
      `itqanak:auth:rate:${rule.scope}:${hashRateLimitSubject(subject)}`,
      "60",
    );
    expect(evaluate.mock.calls[0]?.[2]).not.toContain(subject);
  });

  it("returns a bounded remaining count and blocks requests above the limit", async () => {
    const evaluate = vi.fn().mockResolvedValue([3, 60]);
    const limiter = new RedisRateLimiter({ eval: evaluate } as never, true);

    await expect(limiter.enforce(rule, "subject")).resolves.toEqual({
      allowed: false,
      remaining: 0,
    });
  });

  it("does not call Redis when rate limiting is explicitly disabled", async () => {
    const evaluate = vi.fn();
    const limiter = new RedisRateLimiter({ eval: evaluate } as never, false);

    await expect(limiter.enforce(rule, "subject")).resolves.toEqual({
      allowed: true,
      remaining: 2,
    });
    expect(evaluate).not.toHaveBeenCalled();
  });

  it("fails closed when Redis is unavailable or returns an invalid response", async () => {
    const unavailable = new RedisRateLimiter(
      { eval: vi.fn().mockRejectedValue(new Error("unavailable")) } as never,
      true,
    );
    const malformed = new RedisRateLimiter(
      { eval: vi.fn().mockResolvedValue("unexpected") } as never,
      true,
    );

    await expect(unavailable.enforce(rule, "subject")).rejects.toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
    });
    await expect(malformed.enforce(rule, "subject")).rejects.toMatchObject({
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });

  it("maps a denied result to the public RATE_LIMITED authentication error", async () => {
    const blocked: RateLimiter = {
      enforce: async () => ({ allowed: false, remaining: 0 }),
    };

    await expect(requireWithinRateLimit(blocked, rule, "subject")).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });
});
