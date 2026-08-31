import { readFileSync } from "node:fs";

import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";
import webpush, { type PushSubscription, type WebPushError } from "web-push";

interface ClaimedNotification {
  readonly id: string;
  readonly aggregate_id: string;
  readonly attempt_count: number | string;
}

interface NotificationRow {
  readonly recipient_user_id: string;
  readonly kind: string;
  readonly title_ar: string;
  readonly title_en: string;
  readonly body_ar: string | null;
  readonly body_en: string | null;
  readonly action_href: string | null;
  readonly message_id: string | null;
  readonly conversation_id: string | null;
}

interface SubscriptionRow {
  readonly id: string;
  readonly endpoint: string;
  readonly p256dh: string;
  readonly auth: string;
}

export interface WebPushConfig {
  readonly publicKey: string;
  readonly privateKey: string;
  readonly subject: string;
  readonly publicAppUrl: string;
}

/**
 * Reads Web Push VAPID settings from the environment. Returns undefined (the
 * processor then no-ops) unless a full, plausible configuration is present.
 */
export function webPushConfigFromEnv(env: NodeJS.ProcessEnv): WebPushConfig | undefined {
  const publicKey = (env.WEB_PUSH_VAPID_PUBLIC_KEY ?? "").trim();
  const privateFile = (env.WEB_PUSH_VAPID_PRIVATE_KEY_FILE ?? "").trim();
  let privateKey = (env.WEB_PUSH_VAPID_PRIVATE_KEY ?? "").trim();
  if (privateKey.length === 0 && privateFile.length > 0) {
    try {
      privateKey = readFileSync(privateFile, "utf8").trim();
    } catch {
      privateKey = "";
    }
  }
  const subject = (env.WEB_PUSH_SUBJECT ?? "").trim();
  const publicAppUrl = (env.PUBLIC_APP_URL ?? "https://itqanqhelpstudent.online").trim();
  if (
    publicKey.length < 80 ||
    privateKey.length < 40 ||
    !(subject.startsWith("mailto:") || subject.startsWith("https://"))
  ) {
    return undefined;
  }
  return { publicKey, privateKey, subject, publicAppUrl };
}

function notificationUrl(config: WebPushConfig, actionHref: string | null): string {
  const base = config.publicAppUrl.replace(/\/$/u, "");
  if (actionHref === null) return `${base}/ar/student`;
  if (actionHref.startsWith("http")) return actionHref;
  if (actionHref === "/finance") return `${base}/ar/student/finance`;
  if (actionHref === "/conversation" || actionHref.startsWith("/conversation")) {
    const query = actionHref.startsWith("/conversation?") ? actionHref.slice(13) : "";
    return `${base}/ar/student/support${query}`;
  }
  if (actionHref.startsWith("/ar/") || actionHref.startsWith("/en/")) return `${base}${actionHref}`;
  if (actionHref.startsWith("/")) return `${base}/ar${actionHref}`;
  return `${base}/ar/student`;
}

function retryDelayMs(attempt: number): number {
  return Math.min(30 * 60_000, 10_000 * 2 ** Math.min(attempt - 1, 8));
}

/**
 * Sends an encrypted Web Push message to every subscription of a
 * `user_notifications` recipient. Claims `USER_NOTIFICATION_CREATED` outbox
 * rows with a short lease, exactly like the WhatsApp support processor.
 */
export class WebPushOutboxProcessor {
  private readonly leaseMs = 2 * 60_000;

  public constructor(
    private readonly database: DatabaseClient,
    private readonly config: WebPushConfig,
    private readonly logger: Logger,
    private readonly workerId: string,
    private readonly maxAttempts = 6,
  ) {
    webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  }

  public async processBatch(limit: number): Promise<number> {
    const bounded = Math.max(1, Math.min(10, Math.trunc(limit)));
    const jobs = await this.claim(bounded);
    for (const job of jobs) await this.process(job);
    return jobs.length;
  }

  private async claim(limit: number): Promise<readonly ClaimedNotification[]> {
    return this.database.begin(async (transaction) => {
      const tx = transaction as DatabaseClient;
      const candidates = await tx<ClaimedNotification[]>`
        SELECT id, aggregate_id, attempt_count
        FROM outbox_events
        WHERE event_type = 'USER_NOTIFICATION_CREATED'
          AND aggregate_id IS NOT NULL
          AND status IN ('PENDING', 'RETRY', 'PROCESSING')
          AND available_at <= now()
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
          RETURNING id, aggregate_id, attempt_count
        `;
        if (rows[0] !== undefined) claimed.push(rows[0]);
      }
      return claimed;
    });
  }

  private async process(job: ClaimedNotification): Promise<void> {
    const attempt = Number(job.attempt_count) || 1;
    const notifications = await this.database<NotificationRow[]>`
      SELECT recipient_user_id, kind, title_ar, title_en, body_ar, body_en,
             action_href, message_id, conversation_id
      FROM user_notifications WHERE id = ${job.aggregate_id}
    `;
    const notification = notifications[0];
    if (notification === undefined) {
      await this.finish(job.id, "DELIVERED", "NOTIFICATION_NOT_FOUND");
      return;
    }
    const subscriptions = await this.database<SubscriptionRow[]>`
      SELECT id, endpoint, p256dh, auth
      FROM push_subscriptions
      WHERE user_id = ${notification.recipient_user_id}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    if (subscriptions.length === 0) {
      await this.finish(job.id, "DELIVERED");
      return;
    }
    const payload = JSON.stringify({
      title: notification.title_ar,
      body: notification.body_ar ?? "",
      url: notificationUrl(this.config, notification.action_href),
      tag: `itqanak-${notification.kind}`,
      kind: notification.kind,
      // Lets the service worker stay silent when the recipient already has this
      // exact conversation open on screen (WhatsApp-style).
      ...(notification.conversation_id === null
        ? {}
        : { conversationId: notification.conversation_id }),
    });

    let accepted = 0;
    let transientFailures = 0;
    for (const subscription of subscriptions) {
      const target: PushSubscription = {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      };
      try {
        await webpush.sendNotification(target, payload, { TTL: 24 * 60 * 60 });
        accepted += 1;
        await this.database`
          UPDATE push_subscriptions
          SET failure_count = 0, last_active_at = now()
          WHERE id = ${subscription.id}
        `;
      } catch (error: unknown) {
        const statusCode = (error as WebPushError | undefined)?.statusCode ?? 0;
        if (statusCode === 404 || statusCode === 410) {
          await this.database`DELETE FROM push_subscriptions WHERE id = ${subscription.id}`;
        } else {
          transientFailures += 1;
          await this.database`
            UPDATE push_subscriptions
            SET failure_count = LEAST(failure_count + 1, 32767)
            WHERE id = ${subscription.id}
          `;
        }
      }
    }

    if (
      accepted > 0 &&
      notification.kind === "MESSAGE_RECEIVED" &&
      notification.message_id !== null
    ) {
      // The device received the push: mark the message delivered so the sender
      // sees the second tick, WhatsApp-style, without the recipient opening it.
      await this.database`
        UPDATE support_message_receipts
        SET status = 'DELIVERED', delivered_at = COALESCE(delivered_at, now()), updated_at = now()
        WHERE message_id = ${notification.message_id}
          AND recipient_user_id = ${notification.recipient_user_id}
          AND status = 'SENT'
      `;
    }

    if (accepted > 0 || transientFailures === 0) {
      await this.finish(job.id, "DELIVERED");
      this.logger.info("web_push_notification_delivered", {
        outboxId: job.id,
        recipientUserId: notification.recipient_user_id,
        kind: notification.kind,
        accepted,
        workerId: this.workerId,
      });
      return;
    }
    if (attempt >= this.maxAttempts) {
      await this.finish(job.id, "DEAD_LETTER", "PUSH_TRANSIENT_FAILURE");
    } else {
      await this.retry(job.id, "PUSH_TRANSIENT_FAILURE", retryDelayMs(attempt));
    }
    this.logger.warn("web_push_notification_failed", {
      outboxId: job.id,
      attempt,
      transientFailures,
      workerId: this.workerId,
    });
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
