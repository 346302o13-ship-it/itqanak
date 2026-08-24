import { describe, expect, it } from "vitest";

import {
  boundedNotificationPollDelay,
  notificationSoundEnabled,
  shouldAnnounceNotification,
} from "./notification-client";

describe("notification client helpers", () => {
  it("does not make noise on the first snapshot or when nothing changed", () => {
    expect(shouldAnnounceNotification(undefined, { unreadCount: 4 })).toBe(false);
    expect(
      shouldAnnounceNotification(
        { unreadCount: 4, latestNotificationId: "same" },
        { unreadCount: 4, latestNotificationId: "same" },
      ),
    ).toBe(false);
  });

  it("announces a higher unread count or a different latest notification", () => {
    expect(shouldAnnounceNotification({ unreadCount: 1 }, { unreadCount: 2 })).toBe(true);
    expect(
      shouldAnnounceNotification(
        { unreadCount: 2, latestNotificationId: "old" },
        { unreadCount: 2, latestNotificationId: "new" },
      ),
    ).toBe(true);
  });

  it("requires an explicit persisted opt-in and backs off in hidden tabs", () => {
    expect(notificationSoundEnabled("enabled")).toBe(true);
    expect(notificationSoundEnabled("true")).toBe(false);
    expect(notificationSoundEnabled(null)).toBe(false);
    expect(boundedNotificationPollDelay(true)).toBe(6_000);
    expect(boundedNotificationPollDelay(false)).toBe(30_000);
  });
});
