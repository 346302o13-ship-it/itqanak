import { createHash } from "node:crypto";

import type Redis from "ioredis";

import { AuthenticationError } from "./types.js";

export interface RateLimitRule {
  readonly scope: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
}

export interface RateLimiter {
  enforce(rule: RateLimitRule, subject: string): Promise<RateLimitResult>;
}

const rateLimitScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('TTL', KEYS[1])
return { current, ttl }
`;

export function hashRateLimitSubject(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class RedisRateLimiter implements RateLimiter {
  public constructor(
    private readonly redis: Redis,
    private readonly enabled: boolean,
  ) {}

  public async enforce(rule: RateLimitRule, subject: string): Promise<RateLimitResult> {
    if (!this.enabled) {
      return { allowed: true, remaining: rule.limit };
    }
    try {
      const key = `itqanak:auth:rate:${rule.scope}:${hashRateLimitSubject(subject)}`;
      const result = (await this.redis.eval(
        rateLimitScript,
        1,
        key,
        String(rule.windowSeconds),
      )) as unknown;
      if (!Array.isArray(result) || typeof result[0] !== "number") {
        throw new Error("Unexpected rate-limit response.");
      }
      const count = result[0];
      return { allowed: count <= rule.limit, remaining: Math.max(0, rule.limit - count) };
    } catch {
      throw new AuthenticationError("RATE_LIMIT_UNAVAILABLE");
    }
  }
}

export async function requireWithinRateLimit(
  limiter: RateLimiter,
  rule: RateLimitRule,
  subject: string,
): Promise<void> {
  const result = await limiter.enforce(rule, subject);
  if (!result.allowed) {
    throw new AuthenticationError("RATE_LIMITED");
  }
}

export const authRateLimitRules = {
  registerByIp: { scope: "register-ip", limit: 5, windowSeconds: 3_600 },
  registerByEmail: { scope: "register-email", limit: 3, windowSeconds: 3_600 },
  registerByPhone: { scope: "register-phone", limit: 3, windowSeconds: 3_600 },
  loginByIp: { scope: "login-ip", limit: 10, windowSeconds: 900 },
  loginByEmail: { scope: "login-email", limit: 5, windowSeconds: 900 },
  resendByIp: { scope: "resend-ip", limit: 5, windowSeconds: 3_600 },
  resendByEmail: { scope: "resend-email", limit: 3, windowSeconds: 3_600 },
  resetByIp: { scope: "reset-ip", limit: 5, windowSeconds: 3_600 },
  resetByEmail: { scope: "reset-email", limit: 3, windowSeconds: 3_600 },
  phoneResetByIp: { scope: "phone-reset-ip", limit: 5, windowSeconds: 3_600 },
  phoneResetByPhone: { scope: "phone-reset-phone", limit: 3, windowSeconds: 3_600 },
  resetConfirmByIp: { scope: "reset-confirm-ip", limit: 10, windowSeconds: 900 },
  resetConfirmByToken: { scope: "reset-confirm-token", limit: 5, windowSeconds: 900 },
  verifyByIp: { scope: "verify-ip", limit: 20, windowSeconds: 900 },
  verifyByToken: { scope: "verify-token", limit: 5, windowSeconds: 900 },
  sessionCreateByUser: { scope: "session-create-user", limit: 10, windowSeconds: 3_600 },
  accountSensitiveByUser: { scope: "account-sensitive", limit: 10, windowSeconds: 900 },
  messageSendByUser: { scope: "message-send-user", limit: 30, windowSeconds: 60 },
} as const satisfies Readonly<Record<string, RateLimitRule>>;
