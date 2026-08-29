import { describe, expect, it } from "vitest";

import { localizedNotificationHref, parseNotificationPayload } from "./notification-center";

describe("notification payload parsing", () => {
  it("accepts bounded notification data and ignores unsafe external actions", () => {
    expect(
      parseNotificationPayload({
        unreadCount: 1,
        items: [
          {
            id: "notice-1",
            kind: "MESSAGE_RECEIVED",
            titleAr: "رسالة جديدة",
            titleEn: "New message",
            actionHref: "https://example.test/phishing",
            createdAt: "2026-08-20T12:00:00.000Z",
          },
        ],
      }),
    ).toEqual({
      unreadCount: 1,
      items: [
        {
          id: "notice-1",
          kind: "MESSAGE_RECEIVED",
          titleAr: "رسالة جديدة",
          titleEn: "New message",
          createdAt: "2026-08-20T12:00:00.000Z",
        },
      ],
    });
  });

  it("derives unread count and discards malformed rows", () => {
    expect(
      parseNotificationPayload({
        items: [
          {
            id: "notice-2",
            kind: "REQUEST_UPDATED",
            titleAr: "تحديث طلب",
            titleEn: "Request update",
            createdAt: "2026-08-20T12:00:00.000Z",
          },
          { id: "broken" },
        ],
      }),
    ).toMatchObject({ unreadCount: 1, items: [{ id: "notice-2" }] });
    expect(parseNotificationPayload({ items: "wrong" })).toBeUndefined();
  });

  it("maps role-neutral conversation actions to the localized private inbox", () => {
    expect(localizedNotificationHref("/conversation?request=request-id", "ar", "student")).toBe(
      "/ar/student/support?request=request-id",
    );
    expect(localizedNotificationHref("/conversation", "en", "admin")).toBe("/en/admin/support");
    expect(localizedNotificationHref("/verifications", "ar", "admin")).toBe(
      "/ar/admin/approvals?tab=phone",
    );
    expect(localizedNotificationHref("/verifications", "ar", "student")).toBe("/ar/student");
    expect(localizedNotificationHref("https://example.test", "ar", "admin")).toBe("/ar/admin");
  });
});
