import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { acceptsHtml } from "@/lib/request-http";
import { createFinanceDueFromForm } from "@/lib/finance-form";
import { financeErrorResponse } from "@/lib/finance-http";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/finance`;
    const runtime = await createFinanceRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const due = await runtime.finance.createDue(
        principal,
        createFinanceDueFromForm(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      if (!acceptsHtml(request)) {
        return NextResponse.json(
          { reference: due.reference },
          { status: 201, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
        );
      }
      return NextResponse.redirect(
        new URL(`${fallback}?notice=created`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return financeErrorResponse(request, error, requestId, `/${locale}/admin/finance`, adminAppUrl);
  }
}
