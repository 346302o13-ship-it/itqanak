import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { FinanceError } from "@itqanak/finance";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { financeVersionFromForm, recordFinancePaymentFromForm } from "@/lib/finance-form";
import { financeErrorResponse } from "@/lib/finance-http";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

interface FinanceDueRouteContext {
  readonly params: Promise<{ readonly dueId: string }>;
}

export async function POST(request: NextRequest, context: FinanceDueRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [protectedForm, parameters] = await Promise.all([
      assertProtectedForm(request),
      context.params,
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/finance`;
    const runtime = await createFinanceRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const action = formValue(protectedForm.formData, "action");
      const expectedVersion = financeVersionFromForm(protectedForm.formData);
      if (action === "record-payment") {
        await runtime.finance.recordPayment(
          principal,
          parameters.dueId,
          recordFinancePaymentFromForm(protectedForm.formData),
          { ...protectedForm.context, requestId },
        );
      } else if (action === "reverse-payment") {
        await runtime.finance.reversePayment(
          principal,
          parameters.dueId,
          { expectedVersion, reason: formValue(protectedForm.formData, "reason") },
          { ...protectedForm.context, requestId },
        );
      } else if (action === "void-due") {
        await runtime.finance.voidDue(
          principal,
          parameters.dueId,
          { expectedVersion, reason: formValue(protectedForm.formData, "reason") },
          { ...protectedForm.context, requestId },
        );
      } else {
        throw new FinanceError("INVALID_TRANSITION");
      }
      return NextResponse.redirect(
        new URL(
          `${fallback}?notice=${encodeURIComponent(action)}`,
          protectedForm.config.adminAppUrl,
        ),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return financeErrorResponse(request, error, requestId, `/${locale}/admin/finance`, adminAppUrl);
  }
}
