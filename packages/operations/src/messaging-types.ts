export const announcementLevels = ["INFO", "WARNING", "CRITICAL"] as const;
export type AnnouncementLevel = (typeof announcementLevels)[number];

export interface PlatformMessagingSettings {
  /** E.164 override for the support WhatsApp number shown to students, or undefined for the environment value. */
  readonly supportWhatsAppE164?: string;
  /** E.164 override for the Worker's WhatsApp notification recipient, or undefined for the environment value. */
  readonly whatsappNotifyRecipientE164?: string;
  readonly announcementActive: boolean;
  readonly announcementLevel: AnnouncementLevel;
  readonly announcementAr?: string;
  readonly announcementEn?: string;
  readonly announcementPublishedAt?: Date;
  readonly version: number;
  readonly updatedAt: Date;
}

/** The minimal, unauthenticated projection the Worker and the banner endpoint need. */
export interface RuntimeMessagingSettings {
  readonly supportWhatsAppE164?: string;
  readonly whatsappNotifyRecipientE164?: string;
  readonly announcement?: {
    readonly level: AnnouncementLevel;
    readonly ar: string;
    readonly en: string;
    readonly publishedAt?: Date;
  };
}

export interface UpdateMessagingContactInput {
  readonly supportWhatsAppE164: string | null;
  readonly whatsappNotifyRecipientE164: string | null;
  readonly expectedVersion: number;
}

export interface UpdateAnnouncementInput {
  readonly active: boolean;
  readonly level: AnnouncementLevel;
  readonly ar: string | null;
  readonly en: string | null;
  readonly expectedVersion: number;
}

export const messagingSettingsErrorCodes = [
  "INVALID_PHONE",
  "INVALID_ANNOUNCEMENT",
  "INVALID_VERSION",
  "VERSION_CONFLICT",
  "SETTINGS_UNAVAILABLE",
] as const;
export type MessagingSettingsErrorCode = (typeof messagingSettingsErrorCodes)[number];

export class MessagingSettingsError extends Error {
  public constructor(public readonly code: MessagingSettingsErrorCode) {
    super(code);
    this.name = "MessagingSettingsError";
  }
}
