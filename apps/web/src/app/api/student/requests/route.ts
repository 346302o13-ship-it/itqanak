import type { DatabaseClient } from "@itqanak/db";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { assertProtectedForm, loadWebConfig } from "@/lib/auth-runtime";
import { createDraftInput } from "@/lib/request-form";
import { requestFormErrorResponse, requestFormUnauthorizedResponse } from "@/lib/request-http";
import { getRequestId } from "@/lib/request-id";
import { createStudentRequestRuntime } from "@/lib/request-runtime";
import { principalForRequest } from "@/lib/route-principal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

async function fillQuickRequestFields(
  database: DatabaseClient,
  formData: FormData,
  locale: "ar" | "en",
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (title.length >= 3 && description.length >= 10) return;
  const serviceId = String(formData.get("serviceId") ?? "").trim();
  let serviceName = locale === "en" ? "New request" : "طلب جديد";
  if (UUID.test(serviceId)) {
    try {
      const rows = await database<{ readonly name_ar: string; readonly name_en: string }[]>`
        SELECT name_ar, name_en FROM services WHERE id = ${serviceId} AND active = true LIMIT 1
      `;
      const row = rows[0];
      if (row !== undefined) serviceName = locale === "en" ? row.name_en : row.name_ar;
    } catch {
      // Fall back to the generic name; createDraft still validates serviceId.
    }
  }
  if (title.length < 3) formData.set("title", serviceName);
  if (description.length < 10) {
    formData.set(
      "description",
      locale === "en"
        ? `${serviceName} — I will share the details in the chat.`
        : `${serviceName} — سأوضح التفاصيل في المحادثة.`,
    );
  }
}

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
      // One-tap flow: the student may submit with only a service picked. Derive
      // a title/description from the service name so submission rules pass and
      // the rest of the details are worked out in the chat. Done server-side so
      // it holds even if the page's JS never ran (stale cache, in-app webview).
      if (protectedForm.formData.get("quick") === "true") {
        await fillQuickRequestFields(runtime.database, protectedForm.formData, locale);
      }
      const result = await runtime.requests.createDraft(
        principal,
        createDraftInput(protectedForm.formData),
        { ...protectedForm.context, requestId },
      );
      const detailPath = `/${locale}/student/requests/${encodeURIComponent(result.request.requestNumber)}`;
      const destination = new URL(detailPath, protectedForm.config.publicAppUrl);
      const quick = protectedForm.formData.get("quick") === "true";
      const chatDestination = () => {
        const chat = new URL(`/${locale}/student/support`, protectedForm.config.publicAppUrl);
        chat.searchParams.set("request", result.request.id);
        return chat;
      };

      // A repeated tap (double-tap, retry) replays the same draft. For the
      // one-tap flow that request already exists and is on its way, so send the
      // student to its conversation instead of a "draft already exists" page.
      if (quick && result.idempotentReplay) {
        return NextResponse.redirect(chatDestination(), 303);
      }

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
              acceptedAcademicIntegrity: quick
                ? true
                : protectedForm.formData.get("acceptedAcademicIntegrity") === "true",
              // The one-tap screen shows the integrity clickwrap inline, so trust
              // the server's current policy version instead of a possibly stale
              // one echoed by a cached page.
              academicIntegrityVersion: quick
                ? protectedForm.config.academicIntegrityVersion
                : String(protectedForm.formData.get("academicIntegrityVersion") ?? ""),
            },
            { ...protectedForm.context, requestId },
          );
          // The one-tap flow gathers the rest of the details in the chat, so
          // land the student in the conversation for the new request rather
          // than on a form-heavy detail page.
          return NextResponse.redirect(chatDestination(), 303);
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
