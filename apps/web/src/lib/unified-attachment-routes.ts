import { Readable } from "node:stream";

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedUpload, loadWebConfig, requestAuditContext } from "./auth-runtime";
import { attachmentContentDisposition } from "./attachment-http";
import { requestErrorResponse, requestUnauthorizedResponse } from "./request-http";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { uploadFilename } from "./request-form";
import { principalForRequest } from "./route-principal";
import {
  prepareStreamingUploadBody,
  spoolUploadBody,
  type PreparedUploadBody,
} from "./upload-body";
import { ooxmlUploadSpoolBudget, uploadConcurrencyBudget } from "./upload-spool-budget";
import { createUploadDeadline } from "./upload-http";
import { jsonReady } from "./unified-http";

function requiresZipTrailer(filename: string, declaredMimeType: string): boolean {
  return (
    /\.(?:docx|pptx|xlsx|zip)$/iu.test(filename) ||
    declaredMimeType.startsWith("application/vnd.openxmlformats-officedocument.") ||
    declaredMimeType === "application/zip"
  );
}

export async function unifiedAttachmentUploadRoute(request: NextRequest, studentUserId?: string) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  let bodyStream: Readable | undefined;
  let cleanupBody: (() => Promise<void>) | undefined;
  let closeUploadDeadline: (() => void) | undefined;
  let releaseUploadSlot: (() => void) | undefined;
  let releaseOoxmlBudget: (() => void) | undefined;
  try {
    const maximumBytes = loadWebConfig().storage.maxFileBytes;
    const protectedUpload = await assertProtectedUpload(request, maximumBytes);
    const filename = uploadFilename(request.headers.get("x-itqanak-filename"));
    const declaredMimeType = request.headers.get("content-type")?.split(";", 1)[0] ?? "";
    const linkedRequestId = request.headers.get("x-itqanak-linked-request-id")?.trim() || undefined;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const conversation =
        studentUserId === undefined
          ? await runtime.unifiedConversations.getOrCreateOwnConversation(principal)
          : await runtime.unifiedConversations.openConversationForStudent(principal, studentUserId);
      await runtime.unifiedAttachments.assertUploadAdmission(
        principal,
        conversation.id,
        protectedUpload.contentLength,
        linkedRequestId,
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
      const attachment = await runtime.unifiedAttachments.addAttachment(
        principal,
        conversation.id,
        {
          filename,
          declaredMimeType,
          contentLength: protectedUpload.contentLength,
          header: prepared.header,
          ...(prepared.trailer === undefined ? {} : { trailer: prepared.trailer }),
          body: bodyStream,
          ...(linkedRequestId === undefined ? {} : { requestId: linkedRequestId }),
        },
        { ...protectedUpload.context, requestId },
      );
      return NextResponse.json(
        { attachment: jsonReady(attachment) },
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

export async function unifiedMessageAttachmentRoute(
  request: NextRequest,
  messageId: string,
  preview: boolean,
  studentUserId?: string,
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const conversation =
        studentUserId === undefined
          ? await runtime.unifiedConversations.getOrCreateOwnConversation(principal)
          : await runtime.unifiedConversations.openConversationForStudent(principal, studentUserId);
      const download = await runtime.unifiedAttachments.authorizeMessageAttachment(
        principal,
        conversation.id,
        messageId,
        { ...(await requestAuditContext(request)), requestId },
        preview
          ? {
              requireClean: true,
              allowUnscannedAudioPreview: true,
              allowUnscannedInlineMedia: true,
            }
          : {},
        // Only an explicit download (not an inline preview) delivers the file
        // to the recipient and starts the post-download retention clock.
        !preview,
      );
      if (
        preview &&
        !download.mimeType.startsWith("image/") &&
        !download.mimeType.startsWith("audio/") &&
        !download.mimeType.startsWith("video/")
      ) {
        download.body.destroy();
        return new NextResponse(null, {
          status: 415,
          headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
        });
      }
      const headers = new Headers({
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": preview ? "inline" : attachmentContentDisposition(download.filename),
        "Content-Length": String(download.contentLength),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Type": preview ? download.mimeType : "application/octet-stream",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Request-ID": requestId,
      });
      if (download.scanStatus === "SCAN_SKIPPED_BY_ADMIN") {
        headers.set(
          "Warning",
          '299 - "Unscanned file: malware scanning was disabled by an administrator"',
        );
        headers.set("X-Itqanak-Scan-Status", "skipped-by-admin");
      } else if (download.scanStatus === "SCAN_SKIPPED_DEVELOPMENT") {
        headers.set("Warning", '299 - "Development file: malware scan was skipped"');
        headers.set("X-Itqanak-Scan-Status", "skipped-development");
      }
      return new NextResponse(Readable.toWeb(download.body) as ReadableStream<Uint8Array>, {
        status: 200,
        headers,
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}

export async function unifiedAttachmentStatusRoute(
  request: NextRequest,
  attachmentId: string,
  studentUserId?: string,
) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const conversation =
        studentUserId === undefined
          ? await runtime.unifiedConversations.getOrCreateOwnConversation(principal)
          : await runtime.unifiedConversations.openConversationForStudent(principal, studentUserId);
      const attachment = await runtime.unifiedAttachments.getAttachment(
        principal,
        conversation.id,
        attachmentId,
      );
      return NextResponse.json(
        { attachment: jsonReady(attachment) },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
