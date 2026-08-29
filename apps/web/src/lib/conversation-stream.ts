import "server-only";

import type { NextRequest } from "next/server";

import { hasAdminAccess } from "@itqanak/auth";

import { loadWebConfig } from "./auth-runtime";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";
import { sharedWebDatabase } from "./shared-clients";

interface StreamPayload {
  readonly conversationId?: string;
  readonly messageId?: string;
  readonly senderType?: string;
  readonly sentAt?: string;
}

const heartbeatMs = 20_000;

/**
 * Server-Sent Events accelerator for the unified conversation. Fed by the
 * `itqanak_conversation` LISTEN/NOTIFY channel (migration 022): a hint on every
 * inserted message so the client fetches the delta immediately instead of
 * waiting for its next poll tick. The poll remains the reliable transport, so a
 * dropped stream or a missed notification is harmless. One process-wide listen
 * connection is shared across all open streams by postgres.js.
 */
export async function conversationStreamResponse(
  request: NextRequest,
  mode: "student" | "admin",
): Promise<Response> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createStudentRequestRuntime();
  let ownConversationId: string | undefined;
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) {
      return new Response("unauthorized", { status: 401 });
    }
    if (mode === "admin") {
      if (!hasAdminAccess(principal)) {
        return new Response("forbidden", { status: 403 });
      }
    } else {
      ownConversationId = (await runtime.unifiedConversations.getOrCreateOwnConversation(principal))
        .id;
    }
  } finally {
    await runtime.close();
  }

  const database = sharedWebDatabase(loadWebConfig().databaseUrl ?? "");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (line: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          closed = true;
        }
      };

      send("retry: 3000\n\n");
      send(": connected\n\n");
      const heartbeat = setInterval(() => send(": ping\n\n"), heartbeatMs);

      let unlisten: (() => Promise<unknown>) | undefined;
      try {
        const subscription = await database.listen("itqanak_conversation", (raw: string) => {
          if (closed) return;
          let payload: StreamPayload;
          try {
            payload = JSON.parse(raw) as StreamPayload;
          } catch {
            return;
          }
          if (
            mode === "student" &&
            (ownConversationId === undefined || payload.conversationId !== ownConversationId)
          ) {
            return;
          }
          send(`data: ${JSON.stringify(payload)}\n\n`);
        });
        unlisten = subscription.unlisten;
      } catch {
        // The poll is the reliable transport; tell the client not to wait on us.
        send("event: degraded\ndata: {}\n\n");
      }

      const cleanup = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        void unlisten?.().catch(() => undefined);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Request-ID": requestId,
    },
  });
}
