import { cookies, headers } from "next/headers";
import type { NextRequest } from "next/server";

import Redis from "ioredis";

import {
  assertCsrfToken,
  assertExpectedFormContentType,
  assertExpectedFormContentLength,
  assertExpectedRawUploadContentType,
  assertTrustedHost,
  assertTrustedOrigin,
  AuthService,
  hashRateLimitSubject,
  RedisRateLimiter,
  summarizeUserAgent,
  type AuthenticatedPrincipal,
  type RateLimiter,
  type RequestAuditContext,
} from "@itqanak/auth";
import { loadConfig, type AppConfig } from "@itqanak/config";
import { type DatabaseClient } from "@itqanak/db";

import { sharedWebDatabase } from "./shared-clients";
import { parseUploadContentLength } from "./upload-http";

export { sharedWebDatabase, sharedWebRedis } from "./shared-clients";

export interface AuthRuntime {
  readonly config: AppConfig;
  readonly database: DatabaseClient;
  readonly auth: AuthService;
  readonly rateLimiter?: RateLimiter;
  close(): Promise<void>;
}

export function loadWebConfig(): AppConfig {
  return loadConfig({
    serviceName: "web",
    requirements: { database: true, redis: true, storage: true, fileScanning: true },
    loadDotenv: process.env.NODE_ENV !== "production",
  });
}

export function sessionCookieName(config: AppConfig): string {
  return config.nodeEnv === "production" ? "__Host-itqanak_session" : "itqanak_dev_session";
}

export function csrfCookieName(config: AppConfig): string {
  return config.nodeEnv === "production" ? "__Host-itqanak_csrf" : "itqanak_dev_csrf";
}

export function sessionCookieOptions(config: AppConfig, expiresAt: Date) {
  return {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

export function csrfCookieOptions(config: AppConfig) {
  return {
    httpOnly: false,
    secure: config.nodeEnv === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 8,
  };
}

function redisForAuth(config: AppConfig): Redis {
  return new Redis(config.redisUrl ?? "", {
    connectTimeout: 3_000,
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
}

export async function createAuthRuntime(requireRateLimiting = false): Promise<AuthRuntime> {
  const config = loadWebConfig();
  const database = sharedWebDatabase(config.databaseUrl ?? "");
  let redis: Redis | undefined;
  try {
    if (requireRateLimiting && config.auth.rateLimitEnabled) {
      redis = redisForAuth(config);
      await redis.connect();
    }
    const rateLimiter = redis === undefined ? undefined : new RedisRateLimiter(redis, true);
    const auth = new AuthService({
      database,
      config,
      ...(rateLimiter === undefined ? {} : { rateLimiter }),
    });
    return {
      config,
      database,
      auth,
      ...(rateLimiter === undefined ? {} : { rateLimiter }),
      async close() {
        // The postgres pool is process-shared (see sharedWebDatabase); only the
        // per-request Redis connection is torn down here.
        redis?.disconnect(false);
      },
    };
  } catch (error: unknown) {
    redis?.disconnect(false);
    throw error;
  }
}

export async function requestAuditContext(request: Request): Promise<RequestAuditContext> {
  const source = request.headers;
  const forwarded = source.get("x-real-ip") ?? "unknown";
  const requestId = source.get("x-request-id");
  const correlationId = source.get("x-correlation-id");
  const userAgentSummary = summarizeUserAgent(source.get("user-agent"));
  return {
    ...(requestId === null ? {} : { requestId }),
    ...(correlationId === null ? {} : { correlationId }),
    ...(userAgentSummary === undefined ? {} : { userAgentSummary }),
    ipHash: hashRateLimitSubject(forwarded),
  };
}

export async function currentPrincipal(): Promise<AuthenticatedPrincipal | undefined> {
  // Read request-bound state before configuration so Next marks callers as
  // dynamic during builds instead of evaluating service configuration while
  // prerendering an authenticated page.
  const cookieStore = await cookies();
  const runtime = await createAuthRuntime();
  try {
    return await runtime.auth.authenticateSession(
      cookieStore.get(sessionCookieName(runtime.config))?.value,
    );
  } finally {
    await runtime.close();
  }
}

export async function csrfTokenForPage(): Promise<string | undefined> {
  const cookieStore = await cookies();
  const config = loadWebConfig();
  const existing = cookieStore.get(csrfCookieName(config))?.value;
  if (existing !== undefined) {
    return existing;
  }
  const requestHeaders = await headers();
  return requestHeaders.get("x-itqanak-csrf-token") ?? undefined;
}

export async function assertProtectedForm(request: NextRequest): Promise<{
  readonly formData: FormData;
  readonly context: RequestAuditContext;
  readonly config: AppConfig;
}> {
  const config = loadWebConfig();
  assertExpectedFormContentType(request.headers.get("content-type"));
  assertExpectedFormContentLength(request.headers.get("content-length"));
  const development = config.nodeEnv === "development";
  assertTrustedHost({
    host: request.headers.get("host"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  assertTrustedOrigin({
    origin: request.headers.get("origin"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  const formData = await request.formData();
  const supplied = formData.get("csrfToken");
  assertCsrfToken(
    request.cookies.get(csrfCookieName(config))?.value,
    typeof supplied === "string" ? supplied : null,
  );
  return { formData, context: await requestAuditContext(request), config };
}

export async function assertProtectedUpload(
  request: NextRequest,
  maxBytes: number,
): Promise<{
  readonly contentLength: number;
  readonly context: RequestAuditContext;
  readonly config: AppConfig;
}> {
  const config = loadWebConfig();
  assertExpectedRawUploadContentType(request.headers.get("content-type"));
  const development = config.nodeEnv === "development";
  assertTrustedHost({
    host: request.headers.get("host"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  assertTrustedOrigin({
    origin: request.headers.get("origin"),
    publicAppUrl: config.publicAppUrl,
    adminAppUrl: config.adminAppUrl,
    development,
  });
  assertCsrfToken(
    request.cookies.get(csrfCookieName(config))?.value,
    request.headers.get("x-itqanak-csrf-token"),
  );
  const contentLength = parseUploadContentLength(request.headers.get("content-length"), maxBytes);
  return { contentLength, context: await requestAuditContext(request), config };
}

export async function pageRequestContext(): Promise<RequestAuditContext> {
  const source = await headers();
  return requestAuditContext(new Request("https://itqanak.invalid", { headers: source }));
}

export function formValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}
