/**
 * Ad-campaign attribution cookie shared between `proxy.ts` (which sets it on
 * first landing) and `POST /api/student/requests` (which reads it when a
 * request is created, possibly days later). Kept out of both so the cookie
 * name and shape have exactly one definition.
 */
export interface UtmCookieValue {
  readonly s: string;
  readonly m: string;
  readonly c: string;
}

export function utmCookieName(): string {
  return process.env.NODE_ENV === "production" ? "__Host-itqanak_utm" : "itqanak_dev_utm";
}

/** Never throws — a malformed or tampered cookie just means "no attribution". */
export function parseUtmCookie(raw: string | undefined): UtmCookieValue | undefined {
  if (raw === undefined || raw === "") return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return undefined;
    const { s, m, c } = parsed as Record<string, unknown>;
    if (typeof s !== "string" || s.trim() === "") return undefined;
    return {
      s,
      m: typeof m === "string" ? m : "",
      c: typeof c === "string" ? c : "",
    };
  } catch {
    return undefined;
  }
}
