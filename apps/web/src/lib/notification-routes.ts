import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm } from "./auth-runtime";
import { enforceReadRateLimit, readRateLimitRules } from "./read-rate-limit";
import { requestErrorResponse, requestUnauthorizedResponse } from "./request-http";
import { getRequestId } from "./request-id";
import { createStudentRequestRuntime } from "./request-runtime";
import { principalForRequest } from "./route-principal";
import { jsonReady, notificationListInput } from "./unified-http";

export async function notificationListRoute(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceReadRateLimit(readRateLimitRules.notificationPoll, principal.userId);
      const result = await runtime.notifications.listNotifications(
        principal,
        notificationListInput(request.nextUrl.searchParams),
      );
      return NextResponse.json(jsonReady(result), {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}

export async function notificationUnreadRoute(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      await enforceReadRateLimit(readRateLimitRules.notificationPoll, principal.userId);
      const unreadCount = await runtime.notifications.getUnreadCount(principal);
      return NextResponse.json(
        { unreadCount },
        { headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}

export async function notificationReadRoute(request: NextRequest, notificationId: string) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const result = await runtime.notifications.markRead(principal, notificationId, {
        ...protectedForm.context,
        requestId,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}

export async function notificationReadAllRoute(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const protectedForm = await assertProtectedForm(request);
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const result = await runtime.notifications.markAllRead(principal, {
        ...protectedForm.context,
        requestId,
      });
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store", "X-Request-ID": requestId },
      });
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestErrorResponse(error, requestId);
  }
}
