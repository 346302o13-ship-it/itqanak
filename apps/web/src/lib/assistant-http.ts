import "server-only";

import type { GeminiContent } from "@itqanak/ai";
import {
  assertCsrfToken,
  assertTrustedHost,
  assertTrustedOrigin,
  type RequestAuditContext,
} from "@itqanak/auth";
import type { AppConfig } from "@itqanak/config";
import type { NextRequest } from "next/server";

import { loadWebConfig, csrfCookieName, requestAuditContext } from "./auth-runtime";

const MAX_JSON_BODY_BYTES = 24_000;
const MAX_HISTORY_TURNS = 40;

/**
 * The client holds conversation history itself (nothing is persisted
 * server-side yet — see the assistant memory note) and hands it back on the
 * next call, so this is untrusted input structurally, not just in content.
 * Malformed shapes are dropped to an empty history rather than rejected —
 * always safe to just restart the visible conversation. A forged turn can
 * only mislead the assistant about *its own* prior reply to *this same*
 * caller; every tool call still re-executes for real against the actual
 * signed-in principal, so forged history has no cross-user effect.
 */
function sanitizeHistory(value: unknown): readonly GeminiContent[] {
  if (!Array.isArray(value)) return [];
  const turns: GeminiContent[] = [];
  for (const entry of value.slice(-MAX_HISTORY_TURNS)) {
    if (typeof entry !== "object" || entry === null) continue;
    const role = (entry as { role?: unknown }).role;
    const parts = (entry as { parts?: unknown }).parts;
    if ((role !== "user" && role !== "model") || !Array.isArray(parts)) continue;
    turns.push({ role, parts: parts as GeminiContent["parts"] });
  }
  return turns;
}

export interface AssistantChatRequestBody {
  readonly message: string;
  readonly locale: "ar" | "en";
  /** Client-held turn history from the previous reply — see
   *  ChatResult.history in @itqanak/ai. Structurally sanitized by
   *  sanitizeHistory(); never trusted as anything but conversation text —
   *  it is replayed to Gemini, never interpreted or executed by this server. */
  readonly history: readonly GeminiContent[];
}

/**
 * Shared guard for the three assistant JSON POST routes: same-origin +
 * trusted-host + CSRF-cookie checks (mirrors assertProtectedForm for a JSON
 * body instead of a form), a hard body-size cap, and a minimal shape check
 * on the chat payload.
 */
export async function assertProtectedAssistantRequest(request: NextRequest): Promise<{
  readonly body: AssistantChatRequestBody;
  readonly context: RequestAuditContext;
  readonly config: AppConfig;
}> {
  const config = loadWebConfig();
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error("ASSISTANT_INVALID_CONTENT_TYPE");
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength < 1 || contentLength > MAX_JSON_BODY_BYTES) {
    throw new Error("ASSISTANT_INVALID_CONTENT_LENGTH");
  }
  const development = config.nodeEnv === "development";
  assertTrustedHost({
    host: request.headers.get("host"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  assertTrustedOrigin({
    origin: request.headers.get("origin"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  assertCsrfToken(
    request.cookies.get(csrfCookieName(config))?.value,
    request.headers.get("x-itqanak-csrf-token"),
  );
  const raw: unknown = await request.json();
  const message = (raw as { message?: unknown } | null)?.message;
  if (typeof message !== "string" || message.trim().length === 0 || message.length > 2_000) {
    throw new Error("ASSISTANT_INVALID_MESSAGE");
  }
  const history = sanitizeHistory((raw as { history?: unknown } | null)?.history);
  const locale = (raw as { locale?: unknown } | null)?.locale === "en" ? "en" : "ar";
  return {
    body: { message: message.trim(), locale, history },
    context: await requestAuditContext(request),
    config,
  };
}
