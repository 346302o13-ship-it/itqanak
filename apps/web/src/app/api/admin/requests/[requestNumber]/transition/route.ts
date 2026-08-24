import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isRequestStatus } from "@itqanak/core";
import { RequestDomainError } from "@itqanak/requests";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import {
  adminFormErrorResponse,
  positiveVersion,
  requestErrorResponse,
  requestFormUnauthorizedResponse,
  requestUnauthorizedResponse,
} from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";
import { jsonReady } from "@/lib/unified-http";

interface TransitionRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

export async function POST(request: NextRequest, context: TransitionRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  const { requestNumber } = await context.params;
  const wantsJson = request.headers.get("accept")?.includes("application/json") === true;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/requests/${encodeURIComponent(requestNumber)}`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return wantsJson
          ? requestUnauthorizedResponse(requestId)
          : requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const toStatus = formValue(protectedForm.formData, "toStatus");
      if (!isRequestStatus(toStatus)) throw new RequestDomainError("INVALID_TRANSITION");
      const result = await runtime.adminRequests.transitionRequestStatus(
        principal,
        requestNumber,
        {
          expectedVersion: positiveVersion(protectedForm.formData.get("version")),
          toStatus,
        },
        { ...protectedForm.context, requestId },
      );
      if (wantsJson) {
        return NextResponse.json(
          { request: jsonReady(result) },
          { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      return NextResponse.redirect(
        new URL(`${fallback}?notice=updated`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    if (wantsJson) return requestErrorResponse(error, requestId);
    const fallback = `/${locale}/admin/requests/${encodeURIComponent(requestNumber)}`;
    return adminFormErrorResponse(request, error, requestId, fallback, adminAppUrl);
  }
}
