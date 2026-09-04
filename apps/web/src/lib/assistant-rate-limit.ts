import { requireWithinRateLimit, type RateLimiter, type RateLimitRule } from "@itqanak/auth";

/** Assistant calls are more expensive than a plain DB read (each one spends
 *  Gemini quota), so these stay tighter than the general read-rate rules. */
export const assistantRateLimitRules = {
  visitorByIp: { scope: "assistant-visitor-ip", limit: 20, windowSeconds: 3_600 } as RateLimitRule,
  studentByUser: {
    scope: "assistant-student-user",
    limit: 30,
    windowSeconds: 3_600,
  } as RateLimitRule,
  adminByUser: { scope: "assistant-admin-user", limit: 60, windowSeconds: 3_600 } as RateLimitRule,
};

export async function enforceAssistantRateLimit(
  limiter: RateLimiter | undefined,
  rule: RateLimitRule,
  subject: string,
): Promise<void> {
  if (limiter !== undefined) {
    await requireWithinRateLimit(limiter, rule, subject);
  }
}

export function clientIp(request: Request): string {
  return request.headers.get("x-real-ip") ?? "unknown";
}
