import { AuthorizationError, CsrfError } from "@itqanak/auth";
import { OperationalControlError } from "@itqanak/operations";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeFromRequestPath } from "./request-http";

const localizedMessage = {
  ar: {
    400: "بيانات التحكم التشغيلي غير صالحة.",
    403: "لا تملك صلاحية إدارة التشغيل.",
    409: "غيّر مدير آخر الإعدادات. حدّث الصفحة ثم أعد المحاولة.",
    422: "راجع الرسائل والتأكيد المطلوب قبل تفعيل التحكم الحرج.",
    503: "تعذر قراءة إعدادات التشغيل حالياً.",
    500: "تعذر حفظ إعدادات التشغيل.",
  },
  en: {
    400: "The operational control data is invalid.",
    403: "You do not have permission to manage operations.",
    409: "Another administrator changed the settings. Refresh and try again.",
    422: "Review the messages and confirm before enabling a critical control.",
    503: "Operational settings are currently unavailable.",
    500: "The operational settings could not be saved.",
  },
} as const;

export function operationsErrorStatus(error: unknown): number {
  if (error instanceof CsrfError || error instanceof AuthorizationError) return 403;
  if (!(error instanceof OperationalControlError)) return 500;
  if (error.code === "VERSION_CONFLICT") return 409;
  if (error.code === "SETTINGS_UNAVAILABLE") return 503;
  if (error.code === "INVALID_VERSION" || error.code === "INVALID_STATE") return 400;
  return 422;
}

function acceptsHtml(request: NextRequest): boolean {
  return (
    request.headers
      .get("accept")
      ?.split(",")
      .some((value) => value.trim().toLowerCase().startsWith("text/html")) === true
  );
}

export function operationsErrorResponse(
  request: NextRequest,
  error: unknown,
  requestId: string,
  fallbackPath: string,
  adminAppUrl: string,
): NextResponse {
  const status = operationsErrorStatus(error);
  const locale = localeFromRequestPath(fallbackPath);
  if (acceptsHtml(request)) {
    const notice =
      error instanceof CsrfError
        ? "csrf"
        : status === 409
          ? "conflict"
          : status === 403
            ? "forbidden"
            : status === 503
              ? "unavailable"
              : status === 400 || status === 422
                ? "invalid"
                : "failed";
    const destination = new URL(fallbackPath, adminAppUrl);
    destination.searchParams.set("notice", notice);
    return NextResponse.redirect(destination, 303);
  }
  const messages = localizedMessage[locale];
  return NextResponse.json(
    {
      error: error instanceof OperationalControlError ? error.code : "OPERATIONAL_CONTROL_FAILED",
      message: messages[status as keyof typeof messages] ?? messages[500],
      requestId,
    },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}
