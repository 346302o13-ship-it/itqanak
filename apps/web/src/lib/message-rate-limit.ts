import { authRateLimitRules, requireWithinRateLimit, type RateLimiter } from "@itqanak/auth";

export async function enforceMessageSendRateLimit(
  limiter: RateLimiter | undefined,
  userId: string,
): Promise<void> {
  if (limiter !== undefined) {
    await requireWithinRateLimit(limiter, authRateLimitRules.messageSendByUser, userId);
  }
}
