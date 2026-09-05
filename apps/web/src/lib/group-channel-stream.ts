import "server-only";

import type { NextRequest } from "next/server";

import { hasAdminAccess } from "@itqanak/auth";

import { loadWebConfig } from "./auth-runtime";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";
import { sharedWebDatabase } from "./shared-clients";

const heartbeatMs = 20_000;

/**
 * SSE accelerator for the student group channel. Fed by the
 * `itqanak_group_channel` LISTEN/NOTIFY channel (migration 044): a body-free
 * hint on every message, soft delete, or policy flip so the client re-fetches
 * the authoritative view at once instead of waiting for its 10s poll. The poll
 * stays the reliable transport, so a dropped stream is harmless.
 */
export async function groupChannelStreamResponse(
  request: NextRequest,
  mode: "student" | "admin",
): Promise<Response> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createStudentRequestRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) {
      return new Response("unauthorized", { status: 401 });
    }
    if (mode === "admin" && !hasAdminAccess(principal)) {
      return new Response("forbidden", { status: 403 });
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
        const subscription = await database.listen("itqanak_group_channel", (raw: string) => {
          if (closed) return;
          send(`data: ${raw}\n\n`);
        });
        unlisten = subscription.unlisten;
      } catch {
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
