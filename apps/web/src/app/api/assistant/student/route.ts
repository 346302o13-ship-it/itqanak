import { GeminiAllKeysExhaustedError, runChat } from "@itqanak/ai";
import { AuthenticationError } from "@itqanak/auth";
import { FinanceService } from "@itqanak/finance";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedAssistantRequest } from "@/lib/assistant-http";
import { enforceAssistantRateLimit, assistantRateLimitRules } from "@/lib/assistant-rate-limit";
import { geminiClient } from "@/lib/assistant-runtime";
import {
  buildStudentSystemInstruction,
  createStudentToolExecutor,
  isAllowedStudentActionHref,
  studentTools,
} from "@/lib/assistant-student";
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
      if (principal === undefined) {
        return NextResponse.json(
          { error: "UNAUTHORIZED" },
          { status: 401, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      await enforceAssistantRateLimit(
        runtime.rateLimiter,
        assistantRateLimitRules.studentByUser,
        principal.userId,
      );
      const systemInstruction = buildStudentSystemInstruction(principal.displayName, body.locale);
      const finance = new FinanceService({ database: runtime.database });
      const toolExecutor = createStudentToolExecutor(runtime.requests, finance, principal);
      // Server-persisted history is authoritative — the same durability every
      // other conversation in this platform already has, so the assistant
      // survives a reload instead of resetting. Client-supplied history is
      // ignored here (still accepted for the unauthenticated visitor surface).
      const priorHistory = await runtime.assistantHistory.listRecent(principal.userId);
      const result = await runChat(client, {
        systemInstruction,
        userMessage: body.message,
        history: priorHistory,
        tools: studentTools,
        toolExecutor,
        maxOutputTokens: 400,
        isAllowedActionHref: isAllowedStudentActionHref,
      });
      const newTurns = result.history.slice(priorHistory.length);
      await runtime.assistantHistory.append(principal.userId, newTurns);
      await runtime.assistantHistory.trim(principal.userId);
      return NextResponse.json(
        { text: result.text, actions: result.actions },
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
