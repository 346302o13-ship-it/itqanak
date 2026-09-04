import { GeminiAllKeysExhaustedError, runChat } from "@itqanak/ai";
import { AuthenticationError } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedAssistantRequest } from "@/lib/assistant-http";
import {
  clientIp,
  enforceAssistantRateLimit,
  assistantRateLimitRules,
} from "@/lib/assistant-rate-limit";
import { buildVisitorSystemInstruction } from "@/lib/assistant-visitor";
import { geminiClient } from "@/lib/assistant-runtime";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const { body } = await assertProtectedAssistantRequest(request);
    const client = geminiClient();
    if (!client.isConfigured) {
      return NextResponse.json(
        { error: "ASSISTANT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    const runtime = await createStudentRequestRuntime(true);
    try {
      await enforceAssistantRateLimit(
        runtime.rateLimiter,
        assistantRateLimitRules.visitorByIp,
        clientIp(request),
      );
      const systemInstruction = await buildVisitorSystemInstruction(runtime.catalog, body.locale);
      const result = await runChat(client, {
        systemInstruction,
        userMessage: body.message,
        history: body.history,
        maxOutputTokens: 350,
      });
      return NextResponse.json(
        { text: result.text, actions: result.actions, history: result.history },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    if (error instanceof GeminiAllKeysExhaustedError) {
      return NextResponse.json(
        { error: "ASSISTANT_UNAVAILABLE" },
        { status: 503, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    if (error instanceof AuthenticationError && error.code === "RATE_LIMITED") {
      return NextResponse.json(
        { error: "RATE_LIMITED" },
        { status: 429, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }
    return NextResponse.json(
      { error: "INVALID_REQUEST" },
      { status: 400, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
    );
  }
}
