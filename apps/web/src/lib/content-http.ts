import { AuthorizationError, CsrfError } from "@itqanak/auth";
import { ContentBlockError } from "@itqanak/content";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeFromRequestPath } from "./request-http";

const localizedMessage = {
  ar: {
    400: "بيانات المحتوى غير صالحة.",
    403: "لا تملك صلاحية إدارة المحتوى.",
    404: "كتلة المحتوى غير موجودة.",
    409: "تغير المحتوى أو أن المعرّف مستخدم. حدّث الصفحة ثم أعد المحاولة.",
    422: "راجع النصوص المترجمة والرابط وترتيب العرض.",
    500: "تعذر حفظ المحتوى.",
  },
  en: {
    400: "The content data is invalid.",
    403: "You do not have permission to manage content.",
    404: "The content block was not found.",
    409: "The content changed or the slug is already used. Refresh and try again.",
    422: "Review the translated copy, action link and display order.",
    500: "The content could not be saved.",
  },
} as const;

export function contentErrorStatus(error: unknown): number {
  if (error instanceof CsrfError || error instanceof AuthorizationError) return 403;
  if (!(error instanceof ContentBlockError)) return 500;
  if (error.code === "CONTENT_NOT_FOUND") return 404;
  if (error.code === "VERSION_CONFLICT" || error.code === "SLUG_CONFLICT") return 409;
  if (error.code === "INVALID_ID" || error.code === "INVALID_VERSION") return 400;
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

export function contentErrorResponse(
  request: NextRequest,
  error: unknown,
  requestId: string,
  fallbackPath: string,
  adminAppUrl: string,
): NextResponse {
  const status = contentErrorStatus(error);
  const locale = localeFromRequestPath(fallbackPath);
  if (acceptsHtml(request)) {
    const notice =
      error instanceof CsrfError
        ? "csrf"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 400 || status === 422
              ? "invalid"
              : status === 403
                ? "forbidden"
                : "failed";
    const destination = new URL(fallbackPath, adminAppUrl);
    destination.searchParams.set("notice", notice);
    return NextResponse.redirect(destination, 303);
  }
  const messages = localizedMessage[locale];
  return NextResponse.json(
    {
      error: error instanceof ContentBlockError ? error.code : "CONTENT_OPERATION_FAILED",
      message: messages[status as keyof typeof messages] ?? messages[500],
      requestId,
    },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}
