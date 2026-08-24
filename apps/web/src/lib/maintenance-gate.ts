import { loadConfig } from "@itqanak/config";
import { createDatabase } from "@itqanak/db";
import { PlatformOperationsService, type PlatformOperationalState } from "@itqanak/operations";

export type MaintenanceLocale = "ar" | "en";

export interface MaintenanceGateRequest {
  readonly pathname: string;
  readonly hostname: string;
  readonly adminHostname: string;
}

type ReadOperationalState = () => Promise<PlatformOperationalState>;

function normalizedHostname(value: string): string {
  return value.trim().replace(/\.$/u, "").toLowerCase();
}

export function maintenanceLocale(pathname: string): MaintenanceLocale {
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : "ar";
}

export function shouldBypassMaintenance(request: MaintenanceGateRequest): boolean {
  const pathname = request.pathname;
  if (normalizedHostname(request.hostname) === normalizedHostname(request.adminHostname)) {
    return true;
  }
  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/health/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  ) {
    return true;
  }
  return false;
}

export function createMaintenanceStateReader(
  load: ReadOperationalState,
  ttlMs: number,
  now: () => number = Date.now,
): ReadOperationalState {
  let cached: { readonly value: PlatformOperationalState; readonly expiresAt: number } | undefined;
  let pending: Promise<PlatformOperationalState> | undefined;
  return async () => {
    const timestamp = now();
    if (cached !== undefined && cached.expiresAt > timestamp) return cached.value;
    pending ??= load()
      .then((value) => {
        cached = { value, expiresAt: now() + ttlMs };
        return value;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}

let defaultStateReader: ReadOperationalState | undefined;

function getDefaultStateReader(): ReadOperationalState {
  if (defaultStateReader !== undefined) return defaultStateReader;
  const config = loadConfig({
    serviceName: "web-maintenance-gate",
    requirements: { database: true },
    loadDotenv: process.env.NODE_ENV !== "production",
  });
  // One bounded lazy pool per Web process avoids reconnecting on every cache
  // refresh. postgres.js closes its idle socket independently.
  const database = createDatabase(config.databaseUrl ?? "", { maxConnections: 1 });
  const operations = new PlatformOperationsService({ database });
  defaultStateReader = createMaintenanceStateReader(
    () => operations.getRuntimeState(),
    config.operationalControls.maintenanceCacheTtlMs,
  );
  return defaultStateReader;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function maintenancePageResponse(
  state: PlatformOperationalState,
  locale: MaintenanceLocale,
): Response {
  const english = locale === "en";
  const direction = english ? "ltr" : "rtl";
  const title = english ? "Scheduled maintenance" : "صيانة مجدولة";
  const eyebrow = english ? "ITQANAK service notice" : "تنبيه خدمة إتقانك";
  const message = english ? state.maintenanceMessageEn : state.maintenanceMessageAr;
  const support = english
    ? "The administration portal and health checks remain available to authorized operators."
    : "تبقى بوابة الإدارة وفحوصات الصحة متاحة للمشغّلين المصرّح لهم.";
  const otherLocale = english ? "ar" : "en";
  const otherLabel = english ? "العربية" : "English";
  const html = `<!doctype html>
<html lang="${locale}" dir="${direction}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex,nofollow">
    <title>${escapeHtml(title)} · ITQANAK</title>
    <style>
      :root{color-scheme:light;--ink:#112c38;--brand:#146c64;--soft:#eef8f5;--line:#d8e6e3}
      *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#dff4ee 0,transparent 45%),#f7faf9;color:var(--ink);font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
      main{width:min(100%,720px);padding:clamp(28px,6vw,64px);border:1px solid var(--line);border-radius:32px;background:rgba(255,255,255,.96);box-shadow:0 24px 70px rgba(17,44,56,.12)}
      .mark{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:var(--ink);color:#fff;font-weight:900;font-size:28px}.eyebrow{margin:28px 0 8px;color:var(--brand);font-weight:800;letter-spacing:.04em}.eyebrow[dir=rtl]{letter-spacing:0}h1{margin:0;font-size:clamp(32px,7vw,54px);line-height:1.15}.message{margin:24px 0 0;font-size:clamp(18px,3vw,23px);line-height:1.9;white-space:pre-line}.note{margin:24px 0 0;padding:16px 18px;border-radius:18px;background:var(--soft);font-size:14px;line-height:1.7;color:#41605e}a{display:inline-flex;margin-top:24px;color:var(--brand);font-weight:800;text-underline-offset:4px}
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true">إ</div>
      <p class="eyebrow" dir="${direction}">${escapeHtml(eyebrow)}</p>
      <h1>${escapeHtml(title)}</h1>
      <p class="message">${escapeHtml(message)}</p>
      <p class="note">${escapeHtml(support)}</p>
      <a href="/${otherLocale}">${escapeHtml(otherLabel)}</a>
    </main>
  </body>
</html>`;
  return new Response(html, {
    status: 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Security-Policy":
        "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'",
      "Content-Language": locale,
      "Content-Type": "text/html; charset=utf-8",
      "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
      "Referrer-Policy": "no-referrer",
      "Retry-After": "60",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export function maintenanceApiResponse(
  state: PlatformOperationalState,
  locale: MaintenanceLocale,
): Response {
  const message = locale === "en" ? state.maintenanceMessageEn : state.maintenanceMessageAr;
  return Response.json(
    {
      error: "MAINTENANCE_MODE",
      message,
      retryAfterSeconds: 60,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Language": locale,
        "Retry-After": "60",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

/**
 * Proxy hook. Returns a 503 page only for visitor routes while maintenance is
 * active. Operational-state read failures deliberately fail open so the admin
 * and health surfaces can diagnose a database incident.
 */
export async function maintenanceResponseForRequest(
  request: MaintenanceGateRequest,
  readState?: ReadOperationalState,
): Promise<Response | undefined> {
  if (shouldBypassMaintenance(request)) return undefined;
  try {
    const state = await (readState ?? getDefaultStateReader())();
    if (!state.maintenanceEnabled) return undefined;
    const locale = maintenanceLocale(request.pathname);
    return request.pathname === "/api" || request.pathname.startsWith("/api/")
      ? maintenanceApiResponse(state, locale)
      : maintenancePageResponse(state, locale);
  } catch {
    return undefined;
  }
}
