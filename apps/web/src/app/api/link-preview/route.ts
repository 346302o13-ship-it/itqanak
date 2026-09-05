import { createHash } from "node:crypto";

import { AuthenticationError, hashRateLimitSubject } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { createAuthRuntime, loadWebConfig, sharedWebRedis } from "@/lib/auth-runtime";
import { parseLinkPreview, type LinkPreviewData } from "@/lib/link-preview";
import { getRequestId } from "@/lib/request-id";
import { principalForRequest } from "@/lib/route-principal";
import { SsrfBlockedError, ssrfSafeFetchHtml } from "@/lib/ssrf-safe-fetch";

const CACHE_OK_SECONDS = 24 * 60 * 60;
const CACHE_MISS_SECONDS = 60 * 60;
const RATE_LIMIT = 60;
const RATE_WINDOW_SECONDS = 300;

const rateScript = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
return current
`;

function noStore(body: unknown, status: number, requestId: string): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
  });
}

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const target = request.nextUrl.searchParams.get("url")?.trim() ?? "";
  if (target.length === 0 || target.length > 2_048) {
    return noStore({ error: "INVALID_URL" }, 400, requestId);
  }

  const runtime = await createAuthRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) return noStore({ error: "UNAUTHORIZED" }, 401, requestId);

    const config = loadWebConfig();
    const redis = config.redisUrl === undefined ? undefined : sharedWebRedis(config.redisUrl);
    const urlHash = createHash("sha256").update(target).digest("hex");

    if (redis !== undefined && config.auth.rateLimitEnabled) {
      try {
        const key = `itqanak:linkpreview:rate:${hashRateLimitSubject(principal.userId)}`;
        const count = await redis.eval(rateScript, 1, key, String(RATE_WINDOW_SECONDS));
        if (typeof count === "number" && count > RATE_LIMIT) {
          return noStore({ error: "RATE_LIMITED" }, 429, requestId);
        }
      } catch {
        // Fail open on redis error.
      }
    }

    const cacheKey = `itqanak:linkpreview:v1:${urlHash}`;
    if (redis !== undefined) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached !== null) {
          const parsed = JSON.parse(cached) as { ok: boolean; data?: LinkPreviewData };
          return noStore(parsed.ok ? { preview: parsed.data } : { preview: null }, 200, requestId);
        }
      } catch {
        // Ignore cache read errors.
      }
    }

    let preview: LinkPreviewData | null = null;
    try {
      const { finalUrl, html } = await ssrfSafeFetchHtml(target);
      preview = parseLinkPreview(html, finalUrl, target);
      if (preview.title === undefined && preview.description === undefined) preview = null;
    } catch (error: unknown) {
      if (!(error instanceof SsrfBlockedError)) {
        // Unexpected — still return "no preview", never leak details.
      }
      preview = null;
    }

    if (redis !== undefined) {
      try {
        await redis.set(
          cacheKey,
          JSON.stringify(preview === null ? { ok: false } : { ok: true, data: preview }),
          "EX",
          preview === null ? CACHE_MISS_SECONDS : CACHE_OK_SECONDS,
        );
      } catch {
        // Ignore cache write errors.
      }
    }

    return noStore({ preview }, 200, requestId);
  } catch (error: unknown) {
    if (error instanceof AuthenticationError && error.code === "RATE_LIMITED") {
      return noStore({ error: "RATE_LIMITED" }, 429, requestId);
    }
    return noStore({ error: "INVALID_REQUEST" }, 400, requestId);
  } finally {
    await runtime.close();
  }
}
