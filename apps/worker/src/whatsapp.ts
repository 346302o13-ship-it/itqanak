import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import type { PlatformMessagingService } from "@itqanak/operations";

type SupportedEventType = "ACCOUNT_REGISTRATION_CREATED" | "REQUEST_NEEDS_REVIEW";

interface ClaimedNotification {
  readonly id: string;
  readonly event_type: SupportedEventType;
  readonly aggregate_id: string;
  readonly attempt_count: number | string;
}

export interface WhatsAppSupportNotification {
  readonly eventType: SupportedEventType;
  readonly reference: string;
  readonly summary: string;
}

export interface WhatsAppNotificationSender {
  send(
    notification: WhatsAppSupportNotification,
    recipientE164?: string,
  ): Promise<{ readonly messageId?: string }>;
}

export function notificationFenceForConfig(
  config: Pick<AppConfig, "whatsapp">,
  now: () => Date = () => new Date(),
): string {
  return config.whatsapp.notificationsNotBefore ?? now().toISOString();
}

export class WhatsAppDeliveryError extends Error {
  public constructor(
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super("WhatsApp notification delivery failed.");
    this.name = "WhatsAppDeliveryError";
  }
}

function boundedText(value: string, maximum = 500): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= maximum ? normalized : `${normalized.slice(0, maximum - 1)}…`;
}

function attemptNumber(value: number | string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Invalid WhatsApp outbox attempt count.");
  }
  return parsed;
}

function retryDelayMs(attempt: number): number {
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.min(attempt - 1, 8));
}

export class MetaWhatsAppCloudSender implements WhatsAppNotificationSender {
  public constructor(
    private readonly config: AppConfig,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  public async send(
    notification: WhatsAppSupportNotification,
    recipientE164?: string,
  ): Promise<{ readonly messageId?: string }> {
    const whatsapp = this.config.whatsapp;
    if (whatsapp.mode === "dry-run") return {};
    const recipient = recipientE164 ?? whatsapp.supportRecipientE164;
    if (
      whatsapp.mode !== "enabled" ||
      whatsapp.phoneNumberId === undefined ||
      whatsapp.templateName === undefined ||
      whatsapp.templateLanguage === undefined ||
      recipient === undefined ||
      this.config.whatsappAccessToken === undefined
    ) {
      throw new WhatsAppDeliveryError("CONFIGURATION_INVALID", false);
    }

    const eventLabel =
      notification.eventType === "ACCOUNT_REGISTRATION_CREATED"
        ? "حساب جديد"
        : "طلب يحتاج المراجعة";
    let response: Response;
    try {
      response = await this.fetchImplementation(
        `https://graph.facebook.com/${whatsapp.graphApiVersion}/${whatsapp.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.whatsappAccessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: recipient.slice(1),
            type: "template",
            template: {
              name: whatsapp.templateName,
              language: { code: whatsapp.templateLanguage },
              components: [
                {
                  type: "body",
                  parameters: [
                    { type: "text", text: eventLabel },
                    { type: "text", text: boundedText(notification.reference, 120) },
                    { type: "text", text: boundedText(notification.summary) },
                  ],
                },
              ],
            },
          }),
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      throw new WhatsAppDeliveryError("NETWORK_ERROR", true);
    }

    if (!response.ok) {
      // Do not include Meta's response body: it may contain account or message
      // details. 408/429/5xx are transient; other 4xx require operator action.
      const retryable =
        response.status === 408 || response.status === 429 || response.status >= 500;
      throw new WhatsAppDeliveryError(`META_HTTP_${response.status}`, retryable);
    }
    try {
      const payload = (await response.json()) as {
        readonly messages?: readonly { readonly id?: unknown }[];
      };
      const messageId = payload.messages?.[0]?.id;
      return typeof messageId === "string" && messageId.length > 0 ? { messageId } : {};
    } catch {
      return {};
    }
  }
}

export class WhatsAppSupportOutboxProcessor {
  private readonly leaseMs = 2 * 60_000;
  private readonly notificationsNotBefore: string;
  private recipientCache: { readonly value: string | undefined; readonly at: number } | undefined;

  public constructor(
    private readonly database: DatabaseClient,
    private readonly config: AppConfig,
    private readonly sender: WhatsAppNotificationSender,
    private readonly logger: Logger,
    private readonly workerId: string,
    private readonly messaging?: PlatformMessagingService,
  ) {
    // A dry-run without an explicit fence observes only events created after
    // this worker starts. Enabled production mode requires a configured fence.
    this.notificationsNotBefore = notificationFenceForConfig(config);
  }

  /**
   * The administrator can override the notification recipient in
   * `platform_messaging_settings`; the deployed env value is the fallback.
   * Cached briefly so a busy batch does not hammer the row.
   */
  private async resolveRecipient(): Promise<string | undefined> {
    const now = Date.now();
    if (this.recipientCache !== undefined && now - this.recipientCache.at < 60_000) {
      return this.recipientCache.value;
    }
    let value = this.config.whatsapp.supportRecipientE164;
    if (this.messaging !== undefined) {
      try {
        const runtime = await this.messaging.getRuntimeMessaging();
        if (runtime.whatsappNotifyRecipientE164 !== undefined) {
          value = runtime.whatsappNotifyRecipientE164;
        }
      } catch {
        // Keep the environment fallback if the settings row is unreadable.
      }
    }
    this.recipientCache = { value, at: now };
    return value;
  }

  public async processBatch(limit: number): Promise<number> {
    if (this.config.whatsapp.mode === "disabled") return 0;
    const boundedLimit = Math.max(1, Math.min(10, Math.trunc(limit)));
    const jobs = await this.claim(boundedLimit);
    for (const job of jobs) {
      await this.process(job);
    }
    return jobs.length;
  }

  private async claim(limit: number): Promise<readonly ClaimedNotification[]> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const candidates = await tx<ClaimedNotification[]>`
        SELECT id, event_type, aggregate_id, attempt_count
        FROM outbox_events
        WHERE event_type IN ('ACCOUNT_REGISTRATION_CREATED', 'REQUEST_NEEDS_REVIEW')
          AND aggregate_id IS NOT NULL
          AND created_at >= ${this.notificationsNotBefore}
          AND (
            (status IN ('PENDING', 'RETRY') AND available_at <= now())
            OR (status = 'PROCESSING' AND available_at <= now())
          )
        ORDER BY created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      `;
      const claimed: ClaimedNotification[] = [];
      for (const candidate of candidates) {
        const rows = await tx<ClaimedNotification[]>`
          UPDATE outbox_events
          SET status = 'PROCESSING', attempt_count = attempt_count + 1,
              available_at = now() + (${this.leaseMs} * interval '1 millisecond'),
              last_error_code = NULL
          WHERE id = ${candidate.id}
            AND attempt_count = ${candidate.attempt_count}
            AND status IN ('PENDING', 'RETRY', 'PROCESSING')
            AND available_at <= now()
          RETURNING id, event_type, aggregate_id, attempt_count
        `;
        if (rows[0] !== undefined) claimed.push(rows[0]);
      }
      return claimed;
    });
  }

  private async notificationFor(
    job: ClaimedNotification,
  ): Promise<WhatsAppSupportNotification | undefined> {
    if (job.event_type === "ACCOUNT_REGISTRATION_CREATED") {
      const rows = await this.database<{ readonly id: string }[]>`
        SELECT id FROM users WHERE id = ${job.aggregate_id}
      `;
      const user = rows[0];
      if (user === undefined) return undefined;
      return {
        eventType: job.event_type,
        reference: `ACCOUNT-${user.id.slice(0, 8).toUpperCase()}`,
        summary: "حساب طالب جديد بانتظار المراجعة — افتح لوحة الإدارة للتفاصيل.",
      };
    }

    const rows = await this.database<{ readonly request_number: string }[]>`
      SELECT request_number FROM service_requests WHERE id = ${job.aggregate_id}
    `;
    const request = rows[0];
    if (request === undefined) return undefined;
    return {
      eventType: job.event_type,
      reference: request.request_number,
      summary: "طلب جديد بانتظار المراجعة — افتح لوحة الإدارة للتفاصيل.",
    };
  }

  private async process(job: ClaimedNotification): Promise<void> {
    const attempt = attemptNumber(job.attempt_count);
    const notification = await this.notificationFor(job);
    if (notification === undefined) {
      await this.finish(job.id, "DEAD_LETTER", "AGGREGATE_NOT_FOUND");
      return;
    }
    try {
      const result = await this.sender.send(notification, await this.resolveRecipient());
      await this.finish(job.id, "DELIVERED");
      this.logger.info("whatsapp_support_notification_delivered", {
        outboxId: job.id,
        eventType: job.event_type,
        attempt,
        dryRun: this.config.whatsapp.mode === "dry-run",
        messageAccepted: result.messageId !== undefined,
        workerId: this.workerId,
      });
    } catch (error: unknown) {
      const deliveryError =
        error instanceof WhatsAppDeliveryError
          ? error
          : new WhatsAppDeliveryError("UNEXPECTED_ERROR", true);
      if (!deliveryError.retryable || attempt >= this.config.whatsapp.maxAttempts) {
        await this.finish(job.id, "DEAD_LETTER", deliveryError.code);
      } else {
        await this.retry(job.id, deliveryError.code, retryDelayMs(attempt));
      }
      this.logger.warn("whatsapp_support_notification_failed", {
        outboxId: job.id,
        eventType: job.event_type,
        attempt,
        retryable: deliveryError.retryable,
        errorCode: deliveryError.code,
        workerId: this.workerId,
      });
    }
  }

  private async retry(id: string, errorCode: string, delayMs: number): Promise<void> {
    await this.database`
      UPDATE outbox_events
      SET status = 'RETRY', available_at = now() + (${delayMs} * interval '1 millisecond'),
          last_error_code = ${errorCode}
      WHERE id = ${id} AND status = 'PROCESSING'
    `;
  }

  private async finish(
    id: string,
    status: "DELIVERED" | "DEAD_LETTER",
    errorCode?: string,
  ): Promise<void> {
    await this.database`
      UPDATE outbox_events
      SET status = ${status}, processed_at = now(), available_at = now(),
          last_error_code = ${errorCode ?? null}
      WHERE id = ${id} AND status = 'PROCESSING'
    `;
  }
}
