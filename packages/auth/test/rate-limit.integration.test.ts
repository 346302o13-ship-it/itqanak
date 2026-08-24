import { randomUUID } from "node:crypto";

import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { RedisRateLimiter, requireWithinRateLimit } from "../src/rate-limit.js";

const integrationRedisUrl = process.env.TEST_REDIS_URL;
const integrationDescribe = integrationRedisUrl === undefined ? describe.skip : describe;

integrationDescribe("Redis rate limiter integration", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = new Redis(integrationRedisUrl!, {
      connectTimeout: 1_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
    });
    await redis.connect();
  });

  afterAll(() => {
    redis.disconnect(false);
  });

  it("shares a bounded window and rejects requests beyond the configured limit", async () => {
    const limiter = new RedisRateLimiter(redis, true);
    const rule = { scope: `integration-${randomUUID()}`, limit: 2, windowSeconds: 30 };
    const subject = `student-${randomUUID()}`;

    await expect(limiter.enforce(rule, subject)).resolves.toEqual({ allowed: true, remaining: 1 });
    await expect(limiter.enforce(rule, subject)).resolves.toEqual({ allowed: true, remaining: 0 });
    await expect(requireWithinRateLimit(limiter, rule, subject)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("fails closed when Redis is unavailable", async () => {
    const unavailable = new Redis("redis://127.0.0.1:1/15", {
      connectTimeout: 100,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    try {
      const limiter = new RedisRateLimiter(unavailable, true);
      await expect(
        limiter.enforce({ scope: "integration-unavailable", limit: 1, windowSeconds: 30 }, "x"),
      ).rejects.toMatchObject({ code: "RATE_LIMIT_UNAVAILABLE" });
    } finally {
      unavailable.disconnect(false);
    }
  });
});
