import { randomInt } from "node:crypto";

import nodemailer from "nodemailer";

import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

import { decryptAuthEmailPayload, type AuthEmailPayload } from "./email-payload.js";
import { parseOpaqueToken, validatorsMatch } from "./tokens.js";

export interface AuthEmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly idempotencyKey?: string;
}

export interface AuthEmailSender {
  deliver(message: AuthEmailMessage): Promise<void>;
}

export const authEmailTransportTimeouts = {
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

export class TestAuthEmailSender implements AuthEmailSender {
  public readonly messages: AuthEmailMessage[] = [];

  public async deliver(message: AuthEmailMessage): Promise<void> {
    this.messages.push(message);
  }
}

class SmtpAuthEmailSender implements AuthEmailSender {
  private readonly transport: nodemailer.Transporter;
  private readonly from: string;

  public constructor(config: NonNullable<AppConfig["auth"]["smtp"]>, requireTls: boolean) {
    this.transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      requireTLS: requireTls,
      ...authEmailTransportTimeouts,
      ...(requireTls ? { tls: { minVersion: "TLSv1.2" } } : {}),
      auth: { user: config.fromAddress, pass: config.password },
    });
    this.from = `${config.fromName} <${config.fromAddress}>`;
  }

  public async deliver(message: AuthEmailMessage): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
      ...(message.idempotencyKey === undefined
        ? {}
        : { messageId: `<auth-${message.idempotencyKey}@itqanak.invalid>` }),
      headers: { "X-ITQANAK-Auth": "1" },
    });
  }
}

export function createAuthEmailSender(config: AppConfig): AuthEmailSender | undefined {
  if (config.auth.emailDeliveryMode === "disabled") {
    return undefined;
  }
  if (config.auth.emailDeliveryMode === "test") {
    return new TestAuthEmailSender();
  }
  if (config.auth.smtp === undefined) {
    throw new Error("SMTP configuration is unavailable.");
  }
  return new SmtpAuthEmailSender(config.auth.smtp, config.nodeEnv === "production");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/gu, (character) => {
    const entities: Readonly<Record<string, string>> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character] ?? "";
  });
}

function trustedLink(config: AppConfig, path: string, token: string): string {
  const url = new URL(path, config.publicAppUrl);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function renderAuthEmail(payload: AuthEmailPayload, config: AppConfig): AuthEmailMessage {
  const safeName = escapeHtml(payload.displayName);
  if (payload.kind === "PASSWORD_CHANGED") {
    return {
      to: payload.recipientEmail,
      subject: "تم تغيير كلمة مرور حساب إتقانك",
      text: `مرحباً ${payload.displayName}، تم تغيير كلمة مرور حسابك. إذا لم تكن أنت من قام بذلك، تواصل مع الدعم فوراً.`,
      html: `<p>مرحباً ${safeName}،</p><p>تم تغيير كلمة مرور حسابك في إتقانك.</p><p>إذا لم تكن أنت من قام بذلك، تواصل مع الدعم فوراً.</p>`,
    };
  }
  if (payload.token === undefined) {
    throw new Error("Authentication email token is unavailable.");
  }
  const verify = payload.kind === "VERIFY_EMAIL";
  const link = trustedLink(
    config,
    verify ? "/ar/auth/verify-email" : "/ar/auth/reset-password",
    payload.token,
  );
  const action = verify ? "تأكيد بريدك الإلكتروني" : "إعادة تعيين كلمة المرور";
  const expiry =
    payload.expiresAt === undefined ? "" : `\nتنتهي صلاحية الرابط: ${payload.expiresAt}`;
  return {
    to: payload.recipientEmail,
    subject: verify ? "تأكيد بريدك الإلكتروني في إتقانك" : "إعادة تعيين كلمة مرور إتقانك",
    text: `مرحباً ${payload.displayName}،\n${action}: ${link}${expiry}\nإذا لم تطلب ذلك، تجاهل الرسالة.`,
    html: `<p>مرحباً ${safeName}،</p><p><a href="${escapeHtml(link)}">${action}</a></p><p>إذا لم تطلب ذلك، تجاهل الرسالة.</p>`,
  };
}

interface ClaimedAuthEmail {
  readonly id: string;
  readonly user_id: string;
  readonly idempotency_key: string;
  readonly encrypted_payload: string | null;
  readonly attempt_count: number;
  readonly max_attempts: number;
}

function retryDelaySeconds(attempt: number): number {
  const exponential = Math.min(3_600, 30 * 2 ** Math.min(attempt, 7));
  return exponential + randomInt(0, Math.max(1, Math.floor(exponential / 4)));
}

export class AuthEmailOutboxProcessor {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly config: AppConfig,
    private readonly sender: AuthEmailSender,
    private readonly logger: Logger,
    private readonly workerName: string,
  ) {}

  public async processBatch(limit = 10): Promise<number> {
    const safeLimit = Math.max(1, Math.min(limit, 50));
    await this.database`
      UPDATE auth_email_outbox
      SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
          available_at = now(), last_error_code = 'WORKER_INTERRUPTED', updated_at = now()
      WHERE status = 'PROCESSING' AND locked_at < now() - interval '10 minutes'
    `;
    const claimed = await this.database<ClaimedAuthEmail[]>`
      WITH candidates AS (
        SELECT id
        FROM auth_email_outbox
        WHERE status IN ('PENDING', 'FAILED') AND available_at <= now()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE auth_email_outbox AS outbox
      SET status = 'PROCESSING', locked_at = now(), locked_by = ${this.workerName},
          attempt_count = outbox.attempt_count + 1, updated_at = now()
      FROM candidates
      WHERE outbox.id = candidates.id
      RETURNING outbox.id, outbox.user_id, outbox.idempotency_key, outbox.encrypted_payload,
                outbox.attempt_count, outbox.max_attempts
    `;

    for (const email of claimed) {
      await this.processClaimed(email);
    }
    return claimed.length;
  }

  private async processClaimed(email: ClaimedAuthEmail): Promise<void> {
    try {
      if (email.encrypted_payload === null || this.config.auth.emailPayloadKey === undefined) {
        throw new Error("Authentication email payload is unavailable.");
      }
      const payload = decryptAuthEmailPayload(
        email.encrypted_payload,
        this.config.auth.emailPayloadKey,
      );
      if (!(await this.isCurrentActionPayload(email.user_id, payload))) {
        await this.database`
          UPDATE auth_email_outbox
          SET status = 'DEAD', encrypted_payload = NULL, locked_at = NULL,
              locked_by = NULL, last_error_code = 'TOKEN_SUPERSEDED', updated_at = now()
          WHERE id = ${email.id} AND status = 'PROCESSING'
        `;
        this.logger.info("auth_email_skipped_obsolete", { outboxId: email.id });
        return;
      }
      await this.sender.deliver({
        ...renderAuthEmail(payload, this.config),
        idempotencyKey: email.idempotency_key,
      });
      const deliveredStatus =
        this.config.auth.emailDeliveryMode === "test" ? "SKIPPED_TEST" : "SENT";
      await this.database`
        UPDATE auth_email_outbox
        SET status = ${deliveredStatus}, sent_at = now(), encrypted_payload = NULL,
            payload_metadata = jsonb_build_object('kind', email_kind), locked_at = NULL,
            locked_by = NULL, updated_at = now()
        WHERE id = ${email.id} AND status = 'PROCESSING'
      `;
      this.logger.info("auth_email_sent", { outboxId: email.id });
    } catch {
      const dead = email.attempt_count >= email.max_attempts;
      if (dead) {
        await this.database`
          UPDATE auth_email_outbox
          SET status = 'DEAD', locked_at = NULL, locked_by = NULL,
              last_error_code = 'DELIVERY_FAILED', updated_at = now()
          WHERE id = ${email.id} AND status = 'PROCESSING'
        `;
      } else {
        const delaySeconds = retryDelaySeconds(email.attempt_count);
        await this.database`
          UPDATE auth_email_outbox
          SET status = 'FAILED', locked_at = NULL, locked_by = NULL,
              available_at = now() + (${delaySeconds} * interval '1 second'),
              last_error_code = 'DELIVERY_FAILED', updated_at = now()
          WHERE id = ${email.id} AND status = 'PROCESSING'
        `;
      }
      this.logger.warn("auth_email_delivery_failed", {
        outboxId: email.id,
        dead,
      });
    }
  }

  private async isCurrentActionPayload(
    userId: string,
    payload: AuthEmailPayload,
  ): Promise<boolean> {
    if (payload.kind === "PASSWORD_CHANGED") {
      return true;
    }
    if (payload.token === undefined) {
      return false;
    }
    const parsed = parseOpaqueToken(payload.token);
    if (parsed === undefined) {
      return false;
    }
    const rows =
      payload.kind === "VERIFY_EMAIL"
        ? await this.database<{ readonly user_id: string; readonly validator_hash: string }[]>`
            SELECT user_id, validator_hash FROM email_verification_tokens
            WHERE selector = ${parsed.selector} AND used_at IS NULL
              AND revoked_at IS NULL AND expires_at > now()
          `
        : await this.database<{ readonly user_id: string; readonly validator_hash: string }[]>`
            SELECT user_id, validator_hash FROM password_reset_tokens
            WHERE selector = ${parsed.selector} AND used_at IS NULL
              AND revoked_at IS NULL AND expires_at > now()
          `;
    const token = rows[0];
    return (
      token !== undefined &&
      token.user_id === userId &&
      validatorsMatch(token.validator_hash, parsed.validator)
    );
  }
}
