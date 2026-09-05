import { GROUP_IMAGE_MAX_BYTES } from "@itqanak/requests";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedUpload } from "@/lib/auth-runtime";
import { uploadFilename } from "@/lib/request-form";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady } from "@/lib/unified-http";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedUpload = await assertProtectedUpload(request, GROUP_IMAGE_MAX_BYTES);
    const filename = uploadFilename(request.headers.get("x-itqanak-filename"));
    const declaredMimeType = request.headers.get("content-type")?.split(";", 1)[0]?.trim() ?? "";
    const clientMessageId = request.headers.get("x-itqanak-client-message-id") ?? "";
    const captionHeader = request.headers.get("x-itqanak-caption");
    let caption: string | undefined;
    if (captionHeader !== null && captionHeader.length > 0) {
      try {
        caption = decodeURIComponent(captionHeader);
      } catch {
        caption = undefined;
      }
    }

    const bytes = Buffer.from(await request.arrayBuffer());
    if (bytes.length !== protectedUpload.contentLength || bytes.length > GROUP_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "FILE_TOO_LARGE" },
        { status: 422, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    }

    const appRuntime = await createStudentRequestRuntime(true);
    try {
      const principal = await principalForRequest(appRuntime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      if (!principal.roles.includes("ADMIN")) {
        return NextResponse.json(
          { error: "REQUEST_FORBIDDEN" },
          { status: 403, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      const result = await appRuntime.groupChannel.postImage(
        principal,
        {
          bytes,
          filename,
          declaredMimeType,
          clientMessageId,
          ...(caption === undefined ? {} : { caption }),
        },
        { ...protectedUpload.context, requestId },
      );
      return NextResponse.json(jsonReady(result), {
        status: 201,
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await appRuntime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
