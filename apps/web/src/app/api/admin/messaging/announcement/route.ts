import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import type { AnnouncementLevel } from "@itqanak/operations";

import { assertProtectedForm, formValue, loadWebConfig } from "@/lib/auth-runtime";
import { createMessagingRuntime } from "@/lib/messaging-runtime";
import { messagingErrorRedirect } from "@/lib/messaging-http";
import { getRequestId } from "@/lib/request-id";
import { requestFormUnauthorizedResponse } from "@/lib/request-http";
import { principalForRequest } from "@/lib/route-principal";

export const runtime = "nodejs";

function levelFromForm(value: string): AnnouncementLevel {
  return value === "WARNING" || value === "CRITICAL" ? value : "INFO";
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
      const version = formValue(protectedForm.formData, "version");
      await runtime.messaging.updateAnnouncement(
        principal,
        {
          active: formValue(protectedForm.formData, "active") === "true",
          level: levelFromForm(formValue(protectedForm.formData, "level")),
          ar: formValue(protectedForm.formData, "announcementAr") || null,
          en: formValue(protectedForm.formData, "announcementEn") || null,
          expectedVersion: /^\d{1,9}$/u.test(version) ? Number(version) : 0,
        },
        { ...protectedForm.context, requestId },
      );
      return NextResponse.redirect(
        new URL(`${fallback}?notice=announcement_saved`, protectedForm.config.adminAppUrl),
        303,
      );
    } finally {
      await runtime.close();
    }
  } catch (error: unknown) {
    return messagingErrorRedirect(error, `/${locale}/admin/messaging`, adminAppUrl);
  }
}
