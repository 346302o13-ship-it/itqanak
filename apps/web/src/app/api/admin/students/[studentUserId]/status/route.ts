import { AuthenticationError } from "@itqanak/auth";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { adminFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

// Admin suspends / reactivates one student account (reversible; permission
// admin.users.manage). Suspension revokes the student's live sessions.
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [{ studentUserId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/students`;
    const action =
      formValue(protectedForm.formData, "action") === "reactivate" ? "REACTIVATE" : "SUSPEND";
    const reason = formValue(protectedForm.formData, "reason").trim();
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      if (action === "SUSPEND" && formValue(protectedForm.formData, "confirm") !== "true") {
        throw new AuthenticationError("ACCOUNT_UNAVAILABLE");
      }
      await runtime.auth.setStudentAccountStatus(
        principal,
        studentUserId,
        action,
        { ...protectedForm.context, requestId },
        reason.length === 0 ? undefined : reason,
      );
      const notice = action === "SUSPEND" ? "account_suspended" : "account_reactivated";
      return NextResponse.redirect(
        new URL(`${fallback}?notice=${notice}`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return adminFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/admin/students`,
      adminAppUrl,
    );
  }
}
