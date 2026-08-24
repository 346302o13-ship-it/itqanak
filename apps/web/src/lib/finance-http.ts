import { AuthorizationError, CsrfError } from "@itqanak/auth";
import { FinanceError } from "@itqanak/finance";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { localeFromRequestPath } from "./request-http";

export function financeErrorStatus(error: unknown): number {
  if (error instanceof CsrfError || error instanceof AuthorizationError) return 403;
  if (!(error instanceof FinanceError)) return 500;
  if (error.code === "DUE_NOT_FOUND" || error.code === "REQUEST_NOT_FOUND") return 404;
  if (error.code === "VERSION_CONFLICT" || error.code === "INVALID_TRANSITION") return 409;
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

export function financeErrorResponse(
  request: NextRequest,
  error: unknown,
  requestId: string,
  fallbackPath: string,
  adminAppUrl: string,
): NextResponse {
  const status = financeErrorStatus(error);
  const locale = localeFromRequestPath(fallbackPath);
  const message =
    locale === "en"
      ? "The financial record could not be updated. Review the data and try again."
      : "تعذر تحديث السجل المالي. راجع البيانات ثم حاول مرة أخرى.";
  if (acceptsHtml(request)) {
    const notice =
      error instanceof CsrfError
        ? "csrf"
        : status === 404
          ? "not_found"
          : status === 409
            ? "conflict"
            : status === 403
              ? "forbidden"
              : status === 400 || status === 422
                ? "invalid"
                : "failed";
    const destination = new URL(fallbackPath, adminAppUrl);
    destination.searchParams.set("notice", notice);
    return NextResponse.redirect(destination, 303);
  }
  return NextResponse.json(
    {
      error: error instanceof FinanceError ? error.code : "FINANCE_OPERATION_FAILED",
      message,
      requestId,
    },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}
