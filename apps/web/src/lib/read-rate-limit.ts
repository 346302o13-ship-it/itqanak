import {
  AuthenticationError,
  authRateLimitRules,
  hashRateLimitSubject,
  type RateLimitRule,
} from "@itqanak/auth";

import { loadWebConfig, sharedWebRedis } from "./auth-runtime";

export const readRateLimitRules = {
  conversationPoll: authRateLimitRules.conversationPollByUser,
  notificationPoll: authRateLimitRules.notificationPollByUser,
  readReceipt: authRateLimitRules.readReceiptByUser,
} as const;

const incrementScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

/**
 * Per-user throttle for authenticated read/poll endpoints. Unlike the auth
 * limiter this is FAIL-OPEN: any Redis error is swallowed so a transient outage
 * cannot break polling. nginx `limit_req` is the hard backstop. Throws
 * AuthenticationError("RATE_LIMITED") on exceed, which route handlers already
 * map to 429.
 */
export async function enforceReadRateLimit(rule: RateLimitRule, userId: string): Promise<void> {
  const config = loadWebConfig();
  if (!config.auth.rateLimitEnabled) return;
  try {
    const redis = sharedWebRedis(config.redisUrl ?? "");
    const key = `itqanak:read:rate:${rule.scope}:${hashRateLimitSubject(userId)}`;
    const current = await redis.eval(incrementScript, 1, key, String(rule.windowSeconds));
    if (typeof current === "number" && current > rule.limit) {
      throw new AuthenticationError("RATE_LIMITED");
    }
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) throw error;
    // Fail open on any Redis/eval error.
  }
}
