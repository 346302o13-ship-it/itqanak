import { AuthenticationError, AuthorizationError, CsrfError } from "@itqanak/auth";
import { isRequestStatus } from "@itqanak/core";
import { RequestDomainError, requestSorts, type RequestListInput } from "@itqanak/requests";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const statusByCode: Readonly<Record<RequestDomainError["code"], number>> = {
  REQUEST_NOT_FOUND: 404,
  REQUEST_FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  INVALID_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  SERVICE_INACTIVE: 422,
  INVALID_DEADLINE: 422,
  INVALID_BUDGET: 422,
  INVALID_SUBMISSION_KEY: 400,
  IDEMPOTENCY_KEY_REUSED: 409,
  REQUEST_ALREADY_SUBMITTED: 409,
  ACADEMIC_INTEGRITY_REQUIRED: 422,
  ACADEMIC_INTEGRITY_VERSION_MISMATCH: 409,
  FILE_TOO_LARGE: 422,
  FILE_TYPE_NOT_ALLOWED: 422,
  FILE_MIME_MISMATCH: 422,
  UPLOAD_TIMEOUT: 408,
  MAX_FILES_EXCEEDED: 422,
  TOTAL_FILE_SIZE_EXCEEDED: 422,
  ATTACHMENT_NOT_FOUND: 404,
  ATTACHMENT_NOT_READY: 409,
  ATTACHMENT_STATE_INVALID: 409,
  STORAGE_UNAVAILABLE: 503,
  SCAN_REQUIRED: 503,
  SCANNER_UNAVAILABLE: 503,
  ADMIN_ASSIGNEE_INVALID: 422,
  CONVERSATION_NOT_FOUND: 404,
  INVALID_MESSAGE: 422,
  MESSAGE_ATTACHMENT_REQUIRED: 422,
  INVALID_MESSAGE_ATTACHMENT: 422,
  QUOTE_NOT_FOUND: 404,
  INVALID_QUOTE: 422,
  QUOTE_VERSION_CONFLICT: 409,
  QUOTE_NOT_PENDING: 409,
  QUOTE_EXPIRED: 409,
  NOTIFICATION_NOT_FOUND: 404,
};

const messageByStatus: Readonly<Record<number, string>> = {
  400: "بيانات الطلب غير صالحة.",
  401: "يلزم تسجيل الدخول لإكمال هذا الإجراء.",
  403: "لا تملك صلاحية تنفيذ هذا الإجراء.",
  404: "الطلب أو الملف غير موجود.",
  408: "انتهت مهلة رفع الملف. أعد المحاولة عبر اتصال مستقر.",
  429: "تم تجاوز حد الإرسال المؤقت. انتظر قليلًا ثم أعد المحاولة.",
  409: "تغير الطلب أو تعارضت العملية. حدّث الصفحة ثم أعد المحاولة.",
  422: "تعذر قبول البيانات. راجع الحقول ثم أعد المحاولة.",
  503: "الخدمة المطلوبة غير متاحة مؤقتاً.",
  500: "تعذر إتمام العملية.",
};

export function requestUnauthorizedResponse(requestId: string): NextResponse {
  return NextResponse.json(
    {
      error: "AUTHENTICATION_REQUIRED",
      message: messageByStatus[401],
      requestId,
    },
    {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": "Session",
        "X-Request-ID": requestId,
      },
    },
  );
}

function acceptsHtml(request: NextRequest): boolean {
  return (
    request.headers
      .get("accept")
      ?.split(",")
      .some((value) => value.trim().toLowerCase().startsWith("text/html")) === true
  );
}

export function localeFromRequestPath(path: string): "ar" | "en" {
  return path === "/en" || path.startsWith("/en/") ? "en" : "ar";
}

export function requestFormUnauthorizedResponse(
  request: NextRequest,
  requestId: string,
  next: string,
  publicAppUrl: string,
): NextResponse {
  if (!acceptsHtml(request)) {
    return requestUnauthorizedResponse(requestId);
  }
  const destination = new URL(`/${localeFromRequestPath(next)}/auth/login`, publicAppUrl);
  destination.searchParams.set("next", next);
  return NextResponse.redirect(destination, 303);
}

export function requestFormErrorResponse(
  request: NextRequest,
  error: unknown,
  requestId: string,
  fallbackPath: string,
  publicAppUrl: string,
): NextResponse {
  if (!acceptsHtml(request)) {
    return requestErrorResponse(error, requestId);
  }
  const status = requestErrorStatus(error);
  const notice =
    error instanceof CsrfError
      ? "csrf"
      : status === 400 || status === 422
        ? "invalid"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : status === 503
                ? "unavailable"
                : "failed";
  const safePath =
    status === 403 && !(error instanceof CsrfError)
      ? `/${localeFromRequestPath(fallbackPath)}/student`
      : status === 404
        ? `/${localeFromRequestPath(fallbackPath)}/student/requests`
        : fallbackPath;
  const destination = new URL(safePath, publicAppUrl);
  destination.searchParams.set("notice", notice);
  return NextResponse.redirect(destination, 303);
}

export function adminFormErrorResponse(
  request: NextRequest,
  error: unknown,
  requestId: string,
  fallbackPath: string,
  adminAppUrl: string,
): NextResponse {
  if (!acceptsHtml(request)) {
    return requestErrorResponse(error, requestId);
  }
  const status = requestErrorStatus(error);
  const notice =
    error instanceof CsrfError
      ? "csrf"
      : status === 400 || status === 422
        ? "invalid"
        : status === 403
          ? "forbidden"
          : status === 404
            ? "not_found"
            : status === 409
              ? "conflict"
              : status === 503
                ? "unavailable"
                : "failed";
  const safePath =
    status === 404 ? `/${localeFromRequestPath(fallbackPath)}/admin/requests` : fallbackPath;
  const destination = new URL(safePath, adminAppUrl);
  destination.searchParams.set("notice", notice);
  return NextResponse.redirect(destination, 303);
}

export function requestErrorStatus(error: unknown): number {
  if (error instanceof RequestDomainError) {
    return statusByCode[error.code];
  }
  if (error instanceof CsrfError || error instanceof AuthorizationError) {
    return 403;
  }
  if (error instanceof AuthenticationError) {
    return error.code === "RATE_LIMITED"
      ? 429
      : error.code === "RATE_LIMIT_UNAVAILABLE"
        ? 503
        : 401;
  }
  return 500;
}

export function requestErrorResponse(error: unknown, requestId: string): NextResponse {
  const status = requestErrorStatus(error);
  return NextResponse.json(
    {
      error:
        error instanceof RequestDomainError || error instanceof AuthenticationError
          ? error.code
          : "REQUEST_FAILED",
      message: messageByStatus[status] ?? messageByStatus[500],
      requestId,
    },
    { status, headers: { "Cache-Control": "no-store", "X-Request-ID": requestId } },
  );
}

function single(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !/^\d{1,6}$/u.test(value)) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 ? Math.min(parsed, maximum) : fallback;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export function parseRequestListQuery(
  query: Readonly<Record<string, string | readonly string[] | undefined>>,
): RequestListInput {
  const rawStatus = single(query.status);
  const rawSort = single(query.sort);
  const rawSearch = single(query.q)?.trim().slice(0, 100);
  const rawService = single(query.service);
  return {
    page: boundedInteger(single(query.page), 1, 1_000),
    pageSize: 20,
    ...(rawSearch === undefined || rawSearch.length === 0 ? {} : { search: rawSearch }),
    ...(rawStatus === undefined || !isRequestStatus(rawStatus) ? {} : { status: rawStatus }),
    ...(rawService === undefined || !uuidPattern.test(rawService) ? {} : { serviceId: rawService }),
    ...(rawSort === undefined || !(requestSorts as readonly string[]).includes(rawSort)
      ? { sort: "newest" as const }
      : { sort: rawSort as NonNullable<RequestListInput["sort"]> }),
  };
}

export function positiveVersion(value: FormDataEntryValue | null): number {
  if (typeof value !== "string" || !/^\d{1,10}$/u.test(value)) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  return parsed;
}
