import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue } from "@/lib/auth-runtime";
import { financeErrorResponse } from "@/lib/finance-http";
import { createFinanceRuntime } from "@/lib/finance-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

interface RouteContext {
  readonly params: Promise<{ readonly dueId: string }>;
}

// The client uploads the receipt image via /api/student/conversation/attachments
// first, then posts the resulting attachment id here.
export async function POST(request: NextRequest, context: RouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  try {
    const [{ dueId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    const runtime = await createFinanceRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) return requestUnauthorizedResponse(requestId);
      const submission = await runtime.finance.submitPaymentReceipt(
        principal,
        dueId,
        {
          attachmentId: formValue(protectedForm.formData, "attachmentId"),
          note: formValue(protectedForm.formData, "note") || null,
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.json(
        { submissionId: submission.id, reviewStatus: submission.reviewStatus },
        { status: 201, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return financeErrorResponse(request, error, requestId, "/ar/student/finance", "");
  }
}
