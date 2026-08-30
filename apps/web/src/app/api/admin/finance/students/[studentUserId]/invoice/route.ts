import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { financeErrorResponse } from "@/lib/finance-http";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { getRequestId } from "@/lib/request-id";
import { acceptsHtml, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly studentUserId: string }>;
}

// Sends one consolidated "everything you owe" notification + conversation card
// for a student. Reachable from the admin chat workspace and the finance page.
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
    const fallback = `/${locale}/admin/finance`;
    const runtime = await createFinanceRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const settle = formValue(protectedForm.formData, "action") === "settle";
      const { count } = settle
        ? await runtime.finance.markAllDuesPaid(
            principal,
            studentUserId,
            {
              method: formValue(protectedForm.formData, "method") as
                | "BANK_TRANSFER"
                | "CASH"
                | "OTHER",
              reference: formValue(protectedForm.formData, "reference") || null,
            },
            { ...protectedForm.context, requestId },
          )
        : await runtime.finance.sendOutstandingInvoice(principal, studentUserId, {
            ...protectedForm.context,
            requestId,
          });
      if (!acceptsHtml(request)) {
        return NextResponse.json(
          { count },
          { status: 200, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      return NextResponse.redirect(
        new URL(
          `${fallback}?notice=${settle ? "invoice-settled" : "invoice-sent"}`,
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
