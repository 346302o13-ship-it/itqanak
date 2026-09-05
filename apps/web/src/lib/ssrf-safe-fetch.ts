import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent } from "undici";

import {
  classifyTargetUrl,
  guardedLookup,
  isBlockedAddress,
  SsrfBlockedError,
} from "./ssrf-ip-ranges";

export { SsrfBlockedError };

/**
 * Fetch a user-supplied URL for link previews without letting it reach
 * anything internal. Defence in depth: https-only; a pre-flight DNS check;
 * and — the real enforcement — a dispatcher whose connect-time `lookup`
 * resolves the name itself, rejects the whole host if ANY A/AAAA record is
 * private/reserved, and hands the socket exactly the address it validated
 * (so there is no DNS-rebinding window). Redirects are followed manually
 * with the same checks each hop; hard 5s / 512KB caps; no cookies or
 * credentials; HTML content-type only.
 */

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "ItqanakLinkPreview/1.0 (+https://itqanqhelpstudent.online)";

const guardedAgent = new Agent({
  connect: { lookup: guardedLookup } as NonNullable<Agent.Options["connect"]>,
  connectTimeout: TIMEOUT_MS,
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
  maxRedirections: 0,
});

async function assertPublicHost(hostname: string): Promise<void> {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isIP(bare) !== 0) {
    if (isBlockedAddress(bare)) throw new SsrfBlockedError("target address is not public");
    return;
  }
  let records: readonly { address: string }[];
  try {
    records = await lookup(bare, { all: true });
  } catch {
    throw new SsrfBlockedError("target host does not resolve");
  }
  if (records.length === 0) throw new SsrfBlockedError("target host does not resolve");
  for (const record of records) {
    if (isBlockedAddress(record.address)) {
      throw new SsrfBlockedError("target host resolves to a private address");
    }
  }
}

/** Validates `raw` and returns capped HTML text, following up to
 *  MAX_REDIRECTS manual redirects with a fresh SSRF check at each hop. */
export async function ssrfSafeFetchHtml(raw: string): Promise<{ finalUrl: string; html: string }> {
  const first = classifyTargetUrl(raw);
  if (!first.ok) throw new SsrfBlockedError(first.reason);
  let current = first.url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (hop > 0) {
      const check = classifyTargetUrl(current.toString());
      if (!check.ok) throw new SsrfBlockedError(check.reason);
      current = check.url;
    }
    await assertPublicHost(current.hostname);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        cache: "no-store",
        // undici extension — connect only through the guarded, IP-pinned lookup.
        dispatcher: guardedAgent,
      } as RequestInit & { dispatcher: unknown });
    } catch {
      clearTimeout(timer);
      throw new SsrfBlockedError("request failed");
    }
    clearTimeout(timer);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (location === null) throw new SsrfBlockedError("redirect without a location");
      if (hop === MAX_REDIRECTS) throw new SsrfBlockedError("too many redirects");
      try {
        current = new URL(location, current);
      } catch {
        throw new SsrfBlockedError("invalid redirect target");
      }
      continue;
    }

    if (!response.ok) throw new SsrfBlockedError(`upstream responded ${response.status}`);
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new SsrfBlockedError("target is not an HTML page");
    }

    const reader = response.body?.getReader();
    if (reader === undefined) throw new SsrfBlockedError("empty response body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value !== undefined) {
        total += value.byteLength;
        if (total > MAX_BYTES) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const html = new TextDecoder("utf-8").decode(
      chunks.reduce<Uint8Array>((accumulator, chunk) => {
        const merged = new Uint8Array(accumulator.length + chunk.length);
        merged.set(accumulator);
        merged.set(chunk, accumulator.length);
        return merged;
      }, new Uint8Array(0)),
    );
    return { finalUrl: current.toString(), html };
  }
  throw new SsrfBlockedError("too many redirects");
}
