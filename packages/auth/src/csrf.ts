import { timingSafeEqual } from "node:crypto";

export class CsrfError extends Error {
  public constructor() {
    super("Cross-site request validation failed.");
    this.name = "CsrfError";
  }
}

function sameValue(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizedOrigins(
  publicAppUrl: string,
  adminAppUrl: string,
  development: boolean,
): Set<string> {
  const origins = new Set([new URL(publicAppUrl).origin, new URL(adminAppUrl).origin]);
  if (development) {
    origins.add("http://127.0.0.1:8080");
    origins.add("http://localhost:8080");
    origins.add("http://0.0.0.0:8080");
  }
  return origins;
}

function normalizedHosts(
  publicAppUrl: string,
  adminAppUrl: string,
  development: boolean,
): Set<string> {
  const hosts = new Set([new URL(publicAppUrl).host, new URL(adminAppUrl).host]);
  if (development) {
    hosts.add("127.0.0.1:8080");
    hosts.add("localhost:8080");
    hosts.add("0.0.0.0:8080");
  }
  return hosts;
}

export function assertTrustedOrigin(input: {
  readonly origin: string | null;
  readonly publicAppUrl: string;
  readonly adminAppUrl: string;
  readonly development: boolean;
}): void {
  if (
    input.origin === null ||
    !normalizedOrigins(input.publicAppUrl, input.adminAppUrl, input.development).has(input.origin)
  ) {
    throw new CsrfError();
  }
}

export function assertTrustedHost(input: {
  readonly host: string | null;
  readonly publicAppUrl: string;
  readonly adminAppUrl: string;
  readonly development: boolean;
}): void {
  if (
    input.host === null ||
    !normalizedHosts(input.publicAppUrl, input.adminAppUrl, input.development).has(input.host)
  ) {
    throw new CsrfError();
  }
}

export function assertCsrfToken(
  cookieToken: string | undefined,
  suppliedToken: string | null,
): void {
  if (
    cookieToken === undefined ||
    suppliedToken === null ||
    cookieToken.length < 32 ||
    suppliedToken.length < 32 ||
    !sameValue(cookieToken, suppliedToken)
  ) {
    throw new CsrfError();
  }
}

export function assertExpectedFormContentType(contentType: string | null): void {
  if (
    contentType === null ||
    !contentType.toLowerCase().startsWith("application/x-www-form-urlencoded")
  ) {
    throw new CsrfError();
  }
}

export const maximumProtectedFormBytes = 64 * 1_024;

export function assertExpectedFormContentLength(
  contentLength: string | null,
  maximumBytes = maximumProtectedFormBytes,
): void {
  if (
    !Number.isSafeInteger(maximumBytes) ||
    maximumBytes < 1 ||
    contentLength === null ||
    !/^\d{1,10}$/u.test(contentLength)
  ) {
    throw new CsrfError();
  }
  const bytes = Number(contentLength);
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > maximumBytes) {
    throw new CsrfError();
  }
}

/**
 * Upload endpoints accept one raw file body so it can be streamed without a
 * multipart parser buffering the complete object. MIME policy remains the
 * storage domain's responsibility; this guard only enforces the documented
 * state-changing upload protocol.
 */
export function assertExpectedRawUploadContentType(contentType: string | null): void {
  const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (
    mediaType === undefined ||
    !/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/u.test(mediaType) ||
    mediaType === "application/x-www-form-urlencoded" ||
    mediaType.startsWith("multipart/")
  ) {
    throw new CsrfError();
  }
}
