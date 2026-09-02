import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { OperationalControlError } from "@itqanak/operations";

import { assertProtectedForm, loadWebConfig } from "@/lib/auth-runtime";
import { createOperationsRuntime } from "@/lib/operations-runtime";
import { operationsErrorResponse } from "@/lib/operations-http";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/operations`;

    const rawVersion = formValue(protectedForm.formData, "expectedVersion");
    if (!/^\d{1,9}$/u.test(rawVersion)) {
      throw new OperationalControlError("INVALID_VERSION");
    }
    const rawDays = formValue(protectedForm.formData, "messageRetentionDays");
    if (!/^\d{1,4}$/u.test(rawDays)) {
      throw new OperationalControlError("INVALID_STATE");
    }
    const input = {
      messageArchivalEnabled:
        formValue(protectedForm.formData, "messageArchivalEnabled") === "true",
      messageRetentionDays: Number(rawDays),
      expectedVersion: Number(rawVersion),
      confirmedCriticalAction:
        formValue(protectedForm.formData, "confirmCriticalAction") === "true",
    };

    const operations = await createOperationsRuntime();
    try {
      const principal = await principalForRequest(operations, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await operations.retention.updateRetention(principal, input, {
        ...protectedForm.context,
        requestId,
      });
      const destination = new URL(fallback, protectedForm.config.adminAppUrl);
      destination.searchParams.set("retentionNotice", "updated");
      return NextResponse.redirect(destination, 303);
    } finally {
      await operations.close();
    }
  } catch (error: unknown) {
    // operationsErrorResponse redirects to ?notice=; remap to ?retentionNotice=
    const response = operationsErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/operations`,
      adminAppUrl,
    );
    const location = response.headers.get("location");
    if (location !== null) {
      const url = new URL(location);
      const notice = url.searchParams.get("notice");
      if (notice !== null) {
        url.searchParams.delete("notice");
        url.searchParams.set("retentionNotice", notice);
        return NextResponse.redirect(url, 303);
      }
    }
    return response;
  }
}
