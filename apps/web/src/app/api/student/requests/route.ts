import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, loadWebConfig } from "@/lib/auth-runtime";
import { createDraftInput } from "@/lib/request-form";
import { requestFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const publicAppUrl = loadWebConfig().publicAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = protectedForm.formData.get("locale") === "en" ? "en" : "ar";
    const newRequestPath = `/${locale}/student/requests/new`;
    const runtime = await createStudentRequestRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, newRequestPath, publicAppUrl);
      }
      const result = await runtime.requests.createDraft(
        principal,
        createDraftInput(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      const detailPath = `/${locale}/student/requests/${encodeURIComponent(result.request.requestNumber)}`;
      const destination = new URL(detailPath, protectedForm.config.publicAppUrl);

      // "Save & send": create the draft, then submit it in the same request so a
      // student without files reaches the team in one click instead of a
      // draft-then-submit detour across two pages. A submit failure (incomplete
      // fields, unaccepted policy) still leaves the draft, and we land the
      // student on the detail page with the error to finish there.
      if (protectedForm.formData.get("intent") === "submit" && !result.idempotentReplay) {
        try {
          await runtime.requests.submit(
            principal,
            result.request.requestNumber,
            {
              expectedVersion: result.request.version,
              acceptedAcademicIntegrity:
                protectedForm.formData.get("acceptedAcademicIntegrity") === "true",
              academicIntegrityVersion: String(
                protectedForm.formData.get("academicIntegrityVersion") ?? "",
              ),
            },
            { ...protectedForm.context, requestId },
          );
          // The one-tap flow gathers the rest of the details in the chat, so
          // land the student in the conversation for the new request rather
          // than on a form-heavy detail page.
          const chat = new URL(`/${locale}/student/support`, protectedForm.config.publicAppUrl);
          chat.searchParams.set("request", result.request.id);
          return NextResponse.redirect(chat, 303);
        } catch (submitError: unknown) {
          return requestFormErrorResponse(
            request,
            submitError,
            requestId,
            detailPath,
            publicAppUrl,
          );
        }
      }

      destination.searchParams.set(
        "status",
        result.idempotentReplay ? "draft_exists" : "draft_created",
      );
      return NextResponse.redirect(destination, 303);
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return requestFormErrorResponse(
      request,
      error,
      requestId,
      `/${locale}/student/requests/new`,
      publicAppUrl,
    );
  }
}
