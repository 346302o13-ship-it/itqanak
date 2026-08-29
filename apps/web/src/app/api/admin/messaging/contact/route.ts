import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { createMessagingRuntime } from "@/lib/messaging-runtime";
import { messagingErrorRedirect } from "@/lib/messaging-http";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

function versionFromForm(value: string): number {
  return /^\d{1,9}$/u.test(value) ? Number(value) : 0;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request.headers.get("x-request-id"));
  const adminAppUrl = loadWebConfig().adminAppUrl;
  let locale: "ar" | "en" = "ar";
  try {
    const protectedForm = await assertProtectedForm(request);
    locale = formValue(protectedForm.formData, "locale") === "en" ? "en" : "ar";
    const fallback = `/${locale}/admin/messaging`;
    const runtime = await createMessagingRuntime();
    try {
      const principal = await principalForRequest(runtime, request);
      if (principal === undefined) {
        return requestFormUnauthorizedResponse(request, requestId, fallback, adminAppUrl);
      }
      await runtime.messaging.updateContact(
        principal,
        {
          supportWhatsAppE164: formValue(protectedForm.formData, "supportWhatsAppE164") || null,
          whatsappNotifyRecipientE164:
            formValue(protectedForm.formData, "whatsappNotifyRecipientE164") || null,
          expectedVersion: versionFromForm(formValue(protectedForm.formData, "version")),
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}?notice=contact_saved`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return messagingErrorRedirect(error, `/${locale}/admin/messaging`, adminAppUrl);
  }
}
