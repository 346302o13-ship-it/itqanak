import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Fetch a user-supplied URL for link previews without letting it reach
 * anything internal. Defence in depth: https-only, DNS resolved and every
 * resulting address checked against private/reserved ranges, redirects
 * followed manually with the same checks each hop, hard time and size caps,
 * no cookies/redirect of credentials, HTML content-type only.
 *
 * Known residual gap: DNS-rebinding TOCTOU — the name is re-resolved by
 * `fetch` after this check. Closing it needs a pinned-IP dispatcher. The
 * blast radius here is small (no credentials forwarded, HTML-only, capped,
 * only parsed `<title>`/`og:*` returned), so this is accepted for now — see
 * the chat-audit backlog.
 */
export class SsrfBlockedError extends Error {
  public constructor(reason: string) {
    super(reason);
    this.name = "SsrfBlockedError";
  }
}

const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const USER_AGENT = "ItqanakLinkPreview/1.0 (+https://itqanqhelpstudent.online)";

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split(".");
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255 || !/^\d+$/u.test(part)) {
      return undefined;
    }
    value = value * 256 + octet;
  }
  return value >>> 0;
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToInt(ip);
  if (value === undefined) return true;
  const inRange = (base: string, bits: number): boolean => {
    const baseValue = ipv4ToInt(base);
    if (baseValue === undefined) return false;
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (baseValue & mask);
  };
  return (
    inRange("0.0.0.0", 8) ||
    inRange("10.0.0.0", 8) ||
    inRange("100.64.0.0", 10) ||
    inRange("127.0.0.0", 8) ||
    inRange("169.254.0.0", 16) ||
    inRange("172.16.0.0", 12) ||
    inRange("192.0.0.0", 24) ||
    inRange("192.0.2.0", 24) ||
    inRange("192.88.99.0", 24) ||
    inRange("192.168.0.0", 16) ||
    inRange("198.18.0.0", 15) ||
    inRange("198.51.100.0", 24) ||
    inRange("203.0.113.0", 24) ||
    inRange("224.0.0.0", 4) ||
    inRange("240.0.0.0", 4)
  );
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase().split("%")[0] ?? "";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(lower);
  if (mapped?.[1] !== undefined) return isPrivateIpv4(mapped[1]);
  if (lower === "::" || lower === "::1") return true;
  return (
    lower.startsWith("fc") ||
    lower.startsWith("fd") ||
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("ff") ||
    lower.startsWith("2001:db8:") ||
    lower.startsWith("64:ff9b:") ||
    lower.startsWith("100:")
  );
}

function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicHost(hostname: string): Promise<void> {
  const literal = isIP(hostname);
  if (literal !== 0) {
    if (isBlockedAddress(hostname)) throw new SsrfBlockedError("target address is not public");
    return;
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal")
  ) {
    throw new SsrfBlockedError("target host is not public");
  }
  let records: readonly { address: string }[];
  try {
    records = await lookup(hostname, { all: true });
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
  let current: URL;
  try {
    current = new URL(raw);
  } catch {
    throw new SsrfBlockedError("not a valid URL");
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (current.protocol !== "https:") throw new SsrfBlockedError("only https is allowed");
    if (current.username !== "" || current.password !== "") {
      throw new SsrfBlockedError("credentials in URL are not allowed");
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
      });
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
