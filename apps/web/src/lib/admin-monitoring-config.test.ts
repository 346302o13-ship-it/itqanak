import { describe, expect, it } from "vitest";

import {
  monitoringWhatsAppConfiguration,
  monitoringWhatsAppConfigured,
} from "./admin-monitoring-config";

describe("safe WhatsApp monitoring configuration", () => {
  it("accepts complete non-secret worker descriptors", () => {
    const config = monitoringWhatsAppConfiguration({
      WHATSAPP_MONITORING_MODE: "enabled",
      WHATSAPP_MONITORING_PHONE_NUMBER_ID: "1260466807145770",
      WHATSAPP_MONITORING_TEMPLATE_NAME: "new_service_request_ar1",
      WHATSAPP_MONITORING_TEMPLATE_LANGUAGE: "ar",
      WHATSAPP_MONITORING_SUPPORT_RECIPIENT_E164: "+966570871410",
      WHATSAPP_MONITORING_NOTIFICATIONS_NOT_BEFORE: "2026-08-13T00:00:00Z",
      WHATSAPP_ACCESS_TOKEN: "must-not-be-read-by-this-helper",
    });
    expect(monitoringWhatsAppConfigured(config)).toBe(true);
    expect(config).not.toHaveProperty("accessToken");
    expect(config.notificationsNotBefore?.toISOString()).toBe("2026-08-13T00:00:00.000Z");
    expect(JSON.stringify(config)).not.toContain("must-not-be-read");
  });

  it("reports malformed or incomplete enabled descriptors as unconfigured", () => {
    const config = monitoringWhatsAppConfiguration({
      WHATSAPP_MONITORING_MODE: "enabled",
      WHATSAPP_MONITORING_PHONE_NUMBER_ID: "not-an-id",
      WHATSAPP_MONITORING_SUPPORT_RECIPIENT_E164: "0570000000",
    });
    expect(config).toEqual({ mode: "enabled" });
    expect(monitoringWhatsAppConfigured(config)).toBe(false);
  });
});
