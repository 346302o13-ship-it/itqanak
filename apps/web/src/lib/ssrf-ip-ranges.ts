import { isIP } from "node:net";

/**
 * Pure, dependency-free SSRF range checks — kept out of the `server-only`
 * fetcher so they can be unit-tested (same split as
 * admin-monitoring-presenters).
 */

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

/** True if this literal IP must never be fetched server-side. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

export type TargetUrlCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

/** Synchronous validation done before any DNS lookup or request. */
export function classifyTargetUrl(raw: string): TargetUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "only https is allowed" };
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "credentials in URL are not allowed" };
  }
  const hostname = url.hostname.toLowerCase();
  const bareHost =
    hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isIP(bareHost) !== 0) {
    if (isBlockedAddress(bareHost)) return { ok: false, reason: "target address is not public" };
    return { ok: true, url };
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return { ok: false, reason: "target host is not public" };
  }
  return { ok: true, url };
}
