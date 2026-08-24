import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { ContentBlockError } from "@itqanak/content";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { contentBlockFieldsFromForm, contentVersionFromForm } from "@/lib/content-form";
import { contentErrorResponse } from "@/lib/content-http";
import { createContentRuntime } from "@/lib/content-runtime";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

interface ContentBlockRouteContext {
  readonly params: Promise<{ readonly blockId: string }>;
}

export async function POST(request: NextRequest, context: ContentBlockRouteContext) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const [{ blockId }, protectedForm] = await Promise.all([
      context.params,
      assertProtectedForm(request),
    ]);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/content`;
    const runtime = await createContentRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      const action = formValue(protectedForm.formData, "action");
      const expectedVersion = contentVersionFromForm(protectedForm.formData);
      const auditContext = { ...protectedForm.context, requestId };
      if (action === "update") {
        await runtime.content.updateBlock(
          principal,
          blockId,
          { ...contentBlockFieldsFromForm(protectedForm.formData), expectedVersion },
          auditContext,
        );
      } else if (action === "show" || action === "hide") {
        await runtime.content.setBlockVisibility(
          principal,
          blockId,
          { active: action === "show", expectedVersion },
          auditContext,
        );
      } else if (action === "delete") {
        if (formValue(protectedForm.formData, "confirmDelete") !== "true") {
          throw new ContentBlockError("INVALID_ACTION");
        }
        await runtime.content.deleteBlock(principal, blockId, { expectedVersion }, auditContext);
      } else {
        throw new ContentBlockError("INVALID_ACTION");
      }
      return NextResponse.redirect(
        new URL(
          `${fallback}?notice=${action === "delete" ? "deleted" : "updated"}`,
          protectedForm.config.adminAppUrl,
        ),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return contentErrorResponse(request, error, requestId, `/${locale}/admin/content`, adminAppUrl);
  }
}
