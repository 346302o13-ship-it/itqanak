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
