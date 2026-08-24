import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { isRequestStatus } from "@itqanak/core";
import { RequestDomainError } from "@itqanak/requests";

import { assertProtectedForm, formValue } from "@/lib/auth-runtime";
import {
  positiveVersion,
  requestErrorResponse,
  requestUnauthorizedResponse,
} from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface TransitionRouteContext {
  readonly params: Promise<{ readonly requestNumber: string }>;
}

export async function POST(request: NextRequest, context: TransitionRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ requestNumber }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const toStatus = formValue(protectedForm.formData, "toStatus");
      if (!isRequestStatus(toStatus)) throw new RequestDomainError("INVALID_TRANSITION");
      const result = await runtime.requests.transitionStudentRequest(
        principal,
        requestNumber,
        {
          expectedVersion: positiveVersion(protectedForm.formData.get("version")),
          toStatus,
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(
        { status: result.status, requestVersion: result.version, requestId },
        { headers: { "Cache-Control": "no-store" } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
