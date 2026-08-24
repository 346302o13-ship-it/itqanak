import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "@itqanak/config";

import {
  MetaWhatsAppCloudSender,
  notificationFenceForConfig,
  type WhatsAppDeliveryError,
  type WhatsAppSupportNotification,
} from "./whatsapp.js";

function enabledConfig() {
  return loadConfig({
    serviceName: "whatsapp-test",
    environment: {
      NODE_ENV: "test",
      WHATSAPP_MODE: "enabled",
      WHATSAPP_PHONE_NUMBER_ID: "1260466807145770",
      WHATSAPP_TEMPLATE_NAME: "itqanak_support_event_v1",
      WHATSAPP_TEMPLATE_LANGUAGE: "ar",
      WHATSAPP_GRAPH_API_VERSION: "v25.0",
      WHATSAPP_SUPPORT_RECIPIENT_E164: "+966564202263",
      WHATSAPP_NOTIFICATIONS_NOT_BEFORE: "2026-08-13T00:00:00Z",
      WHATSAPP_ACCESS_TOKEN: "test-system-user-token-that-is-long-enough",
    },
  });
}

const notification: WhatsAppSupportNotification = {
  eventType: "REQUEST_NEEDS_REVIEW",
  reference: "ITQ-2026-000123",
  summary: "طالب اختبار | +966500000000 | طلب تنسيق",
};

describe("Meta WhatsApp Cloud sender", () => {
  it("sends the approved three-parameter template without exposing a store install", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test-message" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const sender = new MetaWhatsAppCloudSender(enabledConfig(), fetchMock);

    await expect(sender.send(notification)).resolves.toEqual({ messageId: "wamid.test-message" });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.facebook.com/v25.0/1260466807145770/messages");
    const body = JSON.parse(String(init?.body)) as {
      readonly to: string;
      readonly template: {
        readonly components: readonly {
          readonly parameters: readonly { readonly text: string }[];
        }[];
      };
    };
    expect(body.to).toBe("966564202263");
    expect(body.template.components[0]?.parameters.map((item) => item.text)).toEqual([
      "طلب يحتاج المراجعة",
      "ITQ-2026-000123",
      notification.summary,
    ]);
  });

  it("classifies Meta throttling as retryable and invalid templates as terminal", async () => {
    const throttled = new MetaWhatsAppCloudSender(
      enabledConfig(),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429 })),
    );
    await expect(throttled.send(notification)).rejects.toEqual(
      expect.objectContaining<Partial<WhatsAppDeliveryError>>({
        code: "META_HTTP_429",
        retryable: true,
      }),
    );

    const invalidTemplate = new MetaWhatsAppCloudSender(
      enabledConfig(),
      vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 400 })),
    );
    await expect(invalidTemplate.send(notification)).rejects.toEqual(
      expect.objectContaining<Partial<WhatsAppDeliveryError>>({
        code: "META_HTTP_400",
        retryable: false,
      }),
    );
  });

  it("performs no network call in dry-run mode", async () => {
    const config = loadConfig({
      serviceName: "whatsapp-dry-run-test",
      environment: { NODE_ENV: "test", WHATSAPP_MODE: "dry-run" },
    });
    const fetchMock = vi.fn<typeof fetch>();
    const sender = new MetaWhatsAppCloudSender(config, fetchMock);
    await expect(sender.send(notification)).resolves.toEqual({});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an explicit activation fence and otherwise ignores older events", () => {
    expect(notificationFenceForConfig(enabledConfig())).toBe("2026-08-13T00:00:00.000Z");
    const dryRun = loadConfig({
      serviceName: "whatsapp-dry-run-fence-test",
      environment: { NODE_ENV: "test", WHATSAPP_MODE: "dry-run" },
    });
    expect(notificationFenceForConfig(dryRun, () => new Date("2026-08-13T12:30:00Z"))).toBe(
      "2026-08-13T12:30:00.000Z",
    );
  });
});
