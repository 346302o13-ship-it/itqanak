import "server-only";

import { Readable } from "node:stream";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requestErrorResponse, requestUnauthorizedResponse } from "./request-http";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";

/**
 * Streams a group-channel image inline. Any authenticated group member may view
 * it; the bytes were proven CLEAN by a synchronous scan at upload, so there is
 * no scan gate here. Locked-down response headers mirror the unified-attachment
 * download path.
 */
export async function groupChannelAttachmentResponse(
  request: NextRequest,
  messageId: string,
): Promise<Response> {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const runtime = await createStudentRequestRuntime();
  try {
    const principal = await principalForRequest(runtime, request);
    if (principal === undefined) return requestUnauthorizedResponse(requestId);
    const download = await runtime.groupChannel.getImageDownload(messageId);
    const body = await runtime.objectStorage.open(download.storageKey);
    return new NextResponse(Readable.toWeb(body) as ReadableStream<Uint8Array>, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "Content-Length": String(download.sizeBytes),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": download.detectedMimeType,
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      },
    });
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  } finally {
    await runtime.close();
  }
}
