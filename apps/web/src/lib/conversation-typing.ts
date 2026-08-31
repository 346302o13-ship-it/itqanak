import "server-only";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasAdminAccess } from "@itqanak/auth";

import { assertProtectedForm, formValue, loadWebConfig } from "./auth-runtime";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";
import { sharedWebDatabase } from "./shared-clients";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * "…is typing" ping. Emits a lightweight `pg_notify` on the same
 * `itqanak_conversation` channel the SSE stream already listens on, tagged
 * `type: "typing"` so the client can show the indicator and clear it on a
 * timer. Nothing is persisted; a missed ping just means no dots that beat.
 */
export async function notifyTyping(
  request: NextRequest,
  mode: "student" | "admin",
): Promise<Response> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return new Response("unauthorized", { status: 401 });

      let conversationId: string | undefined;
      if (mode === "student") {
        conversationId = (await runtime.unifiedConversations.getOrCreateOwnConversation(principal))
          .id;
      } else {
        if (!hasAdminAccess(principal)) return new Response("forbidden", { status: 403 });
        const raw = formValue(protectedForm.formData, "conversationId").trim().toLowerCase();
        conversationId = UUID.test(raw) ? raw : undefined;
      }
      if (conversationId === undefined) return new Response("bad_request", { status: 400 });

      const database = sharedWebDatabase(loadWebConfig().databaseUrl ?? "");
      await database.unsafe("SELECT pg_notify('itqanak_conversation', $1)", [
        JSON.stringify({ type: "typing", conversationId, role: mode, at: Date.now() }),
      ]);
      return NextResponse.json(
        { ok: true },
        { status: 202, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch {
    return new Response("error", { status: 500 });
  }
}
