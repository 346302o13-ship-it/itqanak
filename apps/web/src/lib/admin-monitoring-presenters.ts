import type { AppConfig } from "@itqanak/config";

export type MonitoringHealth = "HEALTHY" | "WARNING" | "CRITICAL" | "UNKNOWN";

export function maskOperationalPhone(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!/^\+[1-9][0-9]{7,14}$/u.test(normalized)) return undefined;
  const visibleSuffix = normalized.slice(-4);
  const visiblePrefix = normalized.slice(0, Math.min(4, normalized.length - 4));
  return `${visiblePrefix}${"•".repeat(Math.max(4, normalized.length - visiblePrefix.length - 4))}${visibleSuffix}`;
}

export function workerHealth(capturedAt: Date, lastSeenAt: Date | undefined): MonitoringHealth {
  if (lastSeenAt === undefined) return "CRITICAL";
  const ageMs = Math.max(0, capturedAt.getTime() - lastSeenAt.getTime());
  if (ageMs <= 45_000) return "HEALTHY";
  if (ageMs <= 120_000) return "WARNING";
  return "CRITICAL";
}

export interface HostResourceUsage {
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly availableBytes: number;
  /** 0..1 */
  readonly usedRatio: number;
}

/** Traffic-light for a disk / memory fill ratio. */
export function hostUsageHealth(usedRatio: number): MonitoringHealth {
  if (!Number.isFinite(usedRatio) || usedRatio < 0) return "UNKNOWN";
  if (usedRatio >= 0.92) return "CRITICAL";
  if (usedRatio >= 0.8) return "WARNING";
  return "HEALTHY";
}

/** Pulls MemTotal + MemAvailable (bytes) out of a `/proc/meminfo` dump. */
export function parseMemInfo(
  raw: string,
): { readonly totalBytes: number; readonly availableBytes: number } | undefined {
  const kb = (key: string): number | undefined => {
    const match = new RegExp(`^${key}:\\s+(\\d+)\\s+kB`, "mu").exec(raw);
    return match === null ? undefined : Number(match[1]) * 1024;
  };
  const totalBytes = kb("MemTotal");
  const availableBytes = kb("MemAvailable") ?? kb("MemFree");
  if (
    totalBytes === undefined ||
    availableBytes === undefined ||
    !Number.isFinite(totalBytes) ||
    totalBytes <= 0
  ) {
    return undefined;
  }
  return { totalBytes, availableBytes };
}

export function toHostUsage(
  totalBytes: number,
  availableBytes: number,
): HostResourceUsage | undefined {
  if (!Number.isFinite(totalBytes) || totalBytes <= 0 || !Number.isFinite(availableBytes)) {
    return undefined;
  }
  const available = Math.max(0, Math.min(totalBytes, availableBytes));
  const usedBytes = totalBytes - available;
  return { totalBytes, usedBytes, availableBytes: available, usedRatio: usedBytes / totalBytes };
}

export function whatsappHealth(input: {
  readonly mode: AppConfig["whatsapp"]["mode"];
  readonly configured: boolean;
  readonly delivered24Hours: number;
  readonly queued: number;
  readonly deadLetter: number;
}): MonitoringHealth {
  if (input.mode === "disabled" || input.mode === "dry-run") return "UNKNOWN";
  if (!input.configured) return "CRITICAL";
  if (input.deadLetter > 0 && input.delivered24Hours === 0) return "CRITICAL";
  if (input.deadLetter > 0 || input.queued > 0) return "WARNING";
  if (input.delivered24Hours === 0) return "UNKNOWN";
  return "HEALTHY";
}
