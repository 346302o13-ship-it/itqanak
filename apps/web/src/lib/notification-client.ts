export const notificationSoundPreferenceKey = "itqanak.notifications.sound.v1";

export interface NotificationCursor {
  readonly unreadCount: number;
  readonly latestNotificationId?: string;
}

export function notificationSoundEnabled(value: string | null): boolean {
  return value === "enabled";
}

export function shouldAnnounceNotification(
  previous: NotificationCursor | undefined,
  current: NotificationCursor,
): boolean {
  if (previous === undefined) return false;
  if (current.unreadCount > previous.unreadCount) return true;
  return (
    current.unreadCount > 0 &&
    current.latestNotificationId !== undefined &&
    current.latestNotificationId !== previous.latestNotificationId
  );
}

export function boundedNotificationPollDelay(documentVisible: boolean): number {
  return documentVisible ? 6_000 : 30_000;
}
