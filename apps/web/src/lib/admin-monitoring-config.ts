import type { WhatsAppMode } from "@itqanak/config";

export interface MonitoringWhatsAppConfiguration {
  readonly mode: WhatsAppMode;
  readonly phoneNumberId?: string;
  readonly templateName?: string;
  readonly templateLanguage?: string;
  readonly supportRecipientE164?: string;
  readonly notificationsNotBefore?: Date;
}

type MonitoringEnvironment = Readonly<Record<string, string | undefined>>;

function optionalMatching(value: string | undefined, pattern: RegExp): string | undefined {
  const normalized = value?.trim();
  return normalized !== undefined && pattern.test(normalized) ? normalized : undefined;
}

function optionalInstant(value: string | undefined): Date | undefined {
  const normalized = value?.trim();
  if (normalized === undefined || normalized.length === 0) return undefined;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * Web receives only these non-secret delivery descriptors. The Meta access
 * token remains mounted exclusively in the Worker container.
 */
export function monitoringWhatsAppConfiguration(
  environment: MonitoringEnvironment = process.env,
): MonitoringWhatsAppConfiguration {
  const rawMode = environment.WHATSAPP_MONITORING_MODE?.trim();
  const mode: WhatsAppMode = rawMode === "enabled" || rawMode === "dry-run" ? rawMode : "disabled";
  const phoneNumberId = optionalMatching(
    environment.WHATSAPP_MONITORING_PHONE_NUMBER_ID,
    /^[0-9]{5,30}$/u,
  );
  const templateName = optionalMatching(
    environment.WHATSAPP_MONITORING_TEMPLATE_NAME,
    /^[a-z0-9_]{1,512}$/u,
  );
  const templateLanguage = optionalMatching(
    environment.WHATSAPP_MONITORING_TEMPLATE_LANGUAGE,
    /^[a-z]{2,3}(?:_[A-Z]{2})?$/u,
  );
  const supportRecipientE164 = optionalMatching(
    environment.WHATSAPP_MONITORING_SUPPORT_RECIPIENT_E164,
    /^\+[1-9][0-9]{7,14}$/u,
  );
  const notificationsNotBefore = optionalInstant(
    environment.WHATSAPP_MONITORING_NOTIFICATIONS_NOT_BEFORE,
  );
  return {
    mode,
    ...(phoneNumberId === undefined ? {} : { phoneNumberId }),
    ...(templateName === undefined ? {} : { templateName }),
    ...(templateLanguage === undefined ? {} : { templateLanguage }),
    ...(supportRecipientE164 === undefined ? {} : { supportRecipientE164 }),
    ...(notificationsNotBefore === undefined ? {} : { notificationsNotBefore }),
  };
}

export function monitoringWhatsAppConfigured(config: MonitoringWhatsAppConfiguration): boolean {
  if (config.mode === "disabled") return false;
  if (config.mode === "dry-run") return true;
  return (
    config.phoneNumberId !== undefined &&
    config.templateName !== undefined &&
    config.templateLanguage !== undefined &&
    config.supportRecipientE164 !== undefined &&
    config.notificationsNotBefore !== undefined
  );
}
