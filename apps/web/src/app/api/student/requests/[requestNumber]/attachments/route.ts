import type { Readable } from "node:stream";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { hasPermission } from "@itqanak/auth";

import { assertProtectedUpload, loadWebConfig } from "@/lib/auth-runtime";
import { requestVersionHeader, uploadFilename } from "@/lib/request-form";
import { requestErrorResponse, requestUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import {
  prepareStreamingUploadBody,
  spoolUploadBody,
  type PreparedUploadBody,
} from "@/lib/upload-body";
import { ooxmlUploadSpoolBudget, uploadConcurrencyBudget } from "@/lib/upload-spool-budget";
import { createUploadDeadline } from "@/lib/upload-http";

interface UploadRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

function requiresZipTrailer(filename: string, declaredMimeType: string): boolean {
  return (
    /\.(?:docx|pptx|xlsx)$/iu.test(filename) ||
    declaredMimeType.startsWith("application/vnd.openxmlformats-officedocument.")
  );
}

export async function POST(request: NextRequest, context: UploadRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  let bodyStream: Readable | undefined;
  let cleanupBody: (() => Promise<void>) | undefined;
  let closeUploadDeadline: (() => void) | undefined;
  let releaseUploadSlot: (() => void) | undefined;
  let releaseOoxmlBudget: (() => void) | undefined;
  try {
    const maximumBytes = loadWebConfig().storage.maxFileBytes;
    const [{ requestNumber }, protectedUpload] = await Promise.all([
      context.params,
      assertProtectedUpload(request, maximumBytes),
    ]);
    const filename = uploadFilename(request.headers.get("x-itqanak-filename"));
    const declaredMimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestUnauthorizedResponse(requestId);
      }
      const expectedVersion = requestVersionHeader(
        request.headers.get("x-itqanak-request-version"),
      );
      // Reject ownership, stale versions, invalid states, service limits, and
      // exhausted request quotas before reading any raw upload bytes. The
      // service repeats this admission atomically when it reserves the row.
      await runtime.attachments.assertUploadAdmission(
        principal,
        requestNumber,
        expectedVersion,
        protectedUpload.contentLength,
      );
      releaseUploadSlot = uploadConcurrencyBudget.reserve();
      const deadline = createUploadDeadline();
      closeUploadDeadline = deadline.close;

      const captureZipTrailer = requiresZipTrailer(filename, declaredMimeType);
      let prepared: PreparedUploadBody;
      if (captureZipTrailer) {
        releaseOoxmlBudget = ooxmlUploadSpoolBudget.reserve(protectedUpload.contentLength);
        prepared = await spoolUploadBody(
          request.body,
          protectedUpload.contentLength,
          deadline.signal,
        );
      } else {
        prepared = await prepareStreamingUploadBody(
          request.body,
          protectedUpload.contentLength,
          deadline.signal,
        );
      }
      bodyStream = prepared.stream;
      cleanupBody = prepared.cleanup;
      const attachment = await runtime.attachments.addAttachment(
        principal,
        requestNumber,
        {
          expectedVersion,
          filename,
          declaredMimeType,
          contentLength: protectedUpload.contentLength,
          header: prepared.header,
          ...(prepared.trailer === undefined ? {} : { trailer: prepared.trailer }),
          body: bodyStream,
        },
        { ...protectedUpload.context, requestId },
      );
      const updated = hasPermission(principal, "admin.requests.read")
        ? await runtime.adminRequests.getAdminRequest(principal, requestNumber)
        : await runtime.requests.getStudentRequest(principal, requestNumber);
      return NextResponse.json(
        {
          attachment: {
            id: attachment.id,
            filename: attachment.originalFilename,
            sizeBytes: attachment.sizeBytes,
            scanStatus: attachment.scanStatus,
          },
          requestVersion: updated.version,
          requestId,
        },
        {
          status: 201,
          headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
        },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    bodyStream?.destroy();
    return requestErrorResponse(error, requestId);
  } finally {
    closeUploadDeadline?.();
    bodyStream?.destroy();
    if (bodyStream === undefined && request.body !== null && !request.body.locked) {
      await request.body.cancel().catch(() => undefined);
    }
    await cleanupBody?.();
    releaseOoxmlBudget?.();
    releaseUploadSlot?.();
  }
}
