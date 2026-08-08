import { describe, expect, it } from "vitest";

import type { AppConfig } from "@itqanak/config";

import { createAuthEmailSender, renderAuthEmail, TestAuthEmailSender } from "./auth-email.js";

const config: AppConfig = {
  nodeEnv: "test",
  serviceName: "auth-test",
  appName: "ITQANAK",
  defaultLocale: "ar",
  publicAppUrl: "https://app.itqanak.test",
  adminAppUrl: "https://admin.itqanak.test/ar/admin",
  migrationsDirectory: "migrations",
  logLevel: "info",
  whatsapp: { mode: "disabled" },
  storage: { driver: "local", maxUploadBytes: 26_214_400 },
  auth: {
    studentSessionAbsoluteTtlSeconds: 2_592_000,
    studentSessionIdleTtlSeconds: 604_800,
    adminSessionAbsoluteTtlSeconds: 43_200,
    adminSessionIdleTtlSeconds: 7_200,
    emailVerificationTtlSeconds: 86_400,
    passwordResetTtlSeconds: 1_800,
    rateLimitEnabled: true,
    emailDeliveryMode: "test",
    termsVersion: "2026-08",
    privacyVersion: "2026-08",
  },
};

describe("authentication-email rendering", () => {
  it("builds verification links from the configured public application URL", () => {
    const message = renderAuthEmail(
      {
        kind: "VERIFY_EMAIL",
        recipientEmail: "student@example.test",
        displayName: "طالب <اختبار>",
        token: "selector.validator",
        expiresAt: "2026-08-06T00:00:00.000Z",
      },
      config,
    );

    expect(message.to).toBe("student@example.test");
    expect(message.subject).toContain("تأكيد");
    expect(message.text).toContain(
      "https://app.itqanak.test/ar/auth/verify-email#token=selector.validator",
    );
    expect(message.html).toContain("طالب &lt;اختبار&gt;");
    expect(message.html).not.toContain("طالب <اختبار>");
  });

  it("does not require a token for a password-changed notice", () => {
    const message = renderAuthEmail(
      {
        kind: "PASSWORD_CHANGED",
        recipientEmail: "student@example.test",
        displayName: "طالب اختبار",
      },
      config,
    );

    expect(message.subject).toContain("تغيير كلمة مرور");
    expect(message.text).not.toContain("token=");
  });

  it("requires a token for verification and reset messages", () => {
    expect(() =>
      renderAuthEmail(
        {
          kind: "PASSWORD_RESET",
          recipientEmail: "student@example.test",
          displayName: "طالب اختبار",
        },
        config,
      ),
    ).toThrow("token");
  });

  it("keeps local test delivery in memory and makes disabled delivery explicit", () => {
    expect(createAuthEmailSender(config)).toBeInstanceOf(TestAuthEmailSender);
    const disabledConfig: AppConfig = {
      ...config,
      auth: { ...config.auth, emailDeliveryMode: "disabled" },
    };

    expect(createAuthEmailSender(disabledConfig)).toBeUndefined();
  });
});
