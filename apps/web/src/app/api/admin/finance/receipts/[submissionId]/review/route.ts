import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { financeErrorResponse } from "@/lib/finance-http";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly submissionId: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [{ submissionId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/finance`;
    const runtime = await createFinanceRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const decision =
        formValue(protectedForm.formData, "decision") === "REJECT" ? "REJECT" : "ACCEPT";
      await runtime.finance.reviewPaymentReceipt(
        principal,
        submissionId,
        { decision, reviewNote: formValue(protectedForm.formData, "reviewNote") || null },
        { ...protectedForm.context, requestId },
      );
      const notice = decision === "ACCEPT" ? "receipt_accepted" : "receipt_rejected";
      return NextResponse.redirect(
        new URL(`${fallback}?notice=${notice}`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return financeErrorResponse(request, error, requestId, `/${locale}/admin/finance`, adminAppUrl);
  }
}
