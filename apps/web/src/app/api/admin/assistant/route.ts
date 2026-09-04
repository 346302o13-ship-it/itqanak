import { GeminiAllKeysExhaustedError, runChat } from "@itqanak/ai";
import { AuthenticationError } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  buildAdminSystemInstruction,
  createAdminToolExecutor,
  adminTools,
} from "@/lib/assistant-admin";
import { assertProtectedAssistantRequest } from "@/lib/assistant-http";
import { enforceAssistantRateLimit, assistantRateLimitRules } from "@/lib/assistant-rate-limit";
import { geminiClient } from "@/lib/assistant-runtime";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

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
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined || !principal.roles.includes("ADMIN")) {
        return NextResponse.json(
          { error: "UNAUTHORIZED" },
          { status: 401, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      await enforceAssistantRateLimit(
        runtime.rateLimiter,
        assistantRateLimitRules.adminByUser,
        principal.userId,
      );
      const systemInstruction = buildAdminSystemInstruction(principal.displayName, body.locale);
      const toolExecutor = createAdminToolExecutor(
        runtime.auth,
        runtime.adminRequests,
        runtime.unifiedConversations,
        principal,
      );
      const result = await runChat(client, {
        systemInstruction,
        userMessage: body.message,
        history: body.history,
        tools: adminTools,
        toolExecutor,
        maxOutputTokens: 500,
        maxIterations: 8,
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
