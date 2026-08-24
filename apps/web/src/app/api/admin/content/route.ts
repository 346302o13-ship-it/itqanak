import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { contentBlockFieldsFromForm } from "@/lib/content-form";
import { contentErrorResponse } from "@/lib/content-http";
import { createContentRuntime } from "@/lib/content-runtime";
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
    const fallback = `/${locale}/admin/content`;
    const runtime = await createContentRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await runtime.content.createBlock(
        principal,
        contentBlockFieldsFromForm(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}?notice=created`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return contentErrorResponse(request, error, requestId, `/${locale}/admin/content`, adminAppUrl);
  }
}
