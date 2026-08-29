"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  boundedNotificationPollDelay,
  notificationSoundEnabled,
  notificationSoundPreferenceKey,
  shouldAnnounceNotification,
  type NotificationCursor,
} from "../lib/notification-client";

import { BellIcon, CheckIcon, CloseIcon } from "./icons";

interface NotificationCenterProps {
  readonly csrfToken: string | undefined;
  readonly locale?: "ar" | "en";
  readonly surface: "student" | "admin";
}

interface NotificationItem {
  readonly id: string;
  readonly kind: string;
  readonly titleAr: string;
  readonly titleEn: string;
  readonly bodyAr?: string;
  readonly bodyEn?: string;
  readonly actionHref?: string;
  readonly createdAt: string;
  readonly readAt?: string;
}

interface NotificationPayload {
  readonly items: readonly NotificationItem[];
  readonly unreadCount: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function notificationItem(value: unknown): NotificationItem | undefined {
  if (!isRecord(value)) return undefined;
  const id = optionalText(value.id);
  const kind = optionalText(value.kind);
  const titleAr = optionalText(value.titleAr);
  const titleEn = optionalText(value.titleEn);
  const createdAt = optionalText(value.createdAt);
  if (
    id === undefined ||
    kind === undefined ||
    titleAr === undefined ||
    titleEn === undefined ||
    createdAt === undefined
  ) {
    return undefined;
  }
  const actionHref = optionalText(value.actionHref);
  return {
    id,
    kind,
    titleAr,
    titleEn,
    createdAt,
    ...(optionalText(value.bodyAr) === undefined ? {} : { bodyAr: String(value.bodyAr) }),
    ...(optionalText(value.bodyEn) === undefined ? {} : { bodyEn: String(value.bodyEn) }),
    ...(actionHref === undefined || !actionHref.startsWith("/") ? {} : { actionHref }),
    ...(optionalText(value.readAt) === undefined ? {} : { readAt: String(value.readAt) }),
  };
}

export function parseNotificationPayload(value: unknown): NotificationPayload | undefined {
  if (!isRecord(value) || !Array.isArray(value.items)) return undefined;
  const items = value.items
    .map((item) => notificationItem(item))
    .filter((item): item is NotificationItem => item !== undefined);
  const unreadCount =
    typeof value.unreadCount === "number" &&
    Number.isSafeInteger(value.unreadCount) &&
    value.unreadCount >= 0
      ? value.unreadCount
      : items.filter((item) => item.readAt === undefined).length;
  return { items, unreadCount };
}

function localized(item: NotificationItem, english: boolean): { title: string; body?: string } {
  const body = english ? item.bodyEn : item.bodyAr;
  return {
    title: english ? item.titleEn : item.titleAr,
    ...(body === undefined ? {} : { body }),
  };
}

export function localizedNotificationHref(
  actionHref: string | undefined,
  locale: "ar" | "en",
  surface: "student" | "admin",
): string {
  const inbox = `/${locale}/${surface}/support`;
  if (actionHref === undefined) return `/${locale}/${surface}`;
  if (actionHref === "/conversation") return inbox;
  if (actionHref.startsWith("/conversation?")) return `${inbox}${actionHref.slice(13)}`;
  if (surface === "admin" && actionHref === "/verifications") {
    return `/${locale}/admin/verifications`;
  }
  if (actionHref.startsWith(`/${locale}/`)) return actionHref;
  return `/${locale}/${surface}`;
}

function playNotificationTone(contextRef: { current: AudioContext | undefined }): void {
  try {
    const context = contextRef.current ?? new AudioContext();
    contextRef.current = context;
    void context.resume().then(() => {
      const now = context.currentTime;
      for (const [offset, frequency] of [
        [0, 880],
        [0.15, 1_080],
      ] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.11, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.11);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + 0.12);
      }
    });
  } catch {
    // Audio is progressive enhancement; the visual counter remains authoritative.
  }
}

export function NotificationCenter({ csrfToken, locale = "ar", surface }: NotificationCenterProps) {
  const english = locale === "en";
  const endpoint = `/api/${surface}/notifications`;
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<readonly NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const cursorRef = useRef<NotificationCursor | undefined>(undefined);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const closePanel = useCallback(
    ({ restoreFocus = true }: Readonly<{ restoreFocus?: boolean }> = {}): void => {
      setOpen(false);
      if (restoreFocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closePanel();
    };
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [closePanel, open]);

  useEffect(() => {
    const enabled = notificationSoundEnabled(
      window.localStorage.getItem(notificationSoundPreferenceKey),
    );
    setSoundEnabled(enabled);
    soundEnabledRef.current = enabled;
  }, []);

  useEffect(() => {
    let active = true;
    let timeout: number | undefined;
    let controller: AbortController | undefined;

    const schedule = (
      delay = boundedNotificationPollDelay(document.visibilityState === "visible"),
    ) => {
      if (!active) return;
      if (timeout !== undefined) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        timeout = undefined;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (!active) return;
      // A hidden tab does not fetch at all; `resume` (visibilitychange / online)
      // brings it back immediately. Background delivery moves to the SSE stream
      // + web push in the realtime phase.
      if (document.visibilityState !== "visible") {
        schedule();
        return;
      }
      const requestController = new AbortController();
      controller?.abort();
      controller = requestController;
      try {
        const response = await fetch(`${endpoint}?page=1&pageSize=12`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: requestController.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("notification fetch failed");
        const payload = parseNotificationPayload(await response.json());
        if (payload === undefined) throw new Error("invalid notification payload");
        if (!active) return;
        const latest = payload.items.find((item) => item.readAt === undefined);
        const cursor: NotificationCursor = {
          unreadCount: payload.unreadCount,
          ...(latest === undefined ? {} : { latestNotificationId: latest.id }),
        };
        const announce = shouldAnnounceNotification(cursorRef.current, cursor);
        cursorRef.current = cursor;
        setItems(payload.items);
        setUnreadCount(payload.unreadCount);
        setUnavailable(false);
        if (announce && soundEnabledRef.current) {
          playNotificationTone(audioContextRef);
          if (document.visibilityState !== "visible" && "Notification" in window) {
            const localizedLatest = latest === undefined ? undefined : localized(latest, english);
            if (Notification.permission === "granted" && localizedLatest !== undefined) {
              new Notification(localizedLatest.title, {
                ...(localizedLatest.body === undefined ? {} : { body: localizedLatest.body }),
                ...(latest === undefined ? {} : { tag: latest.id }),
              });
            }
          }
        }
      } catch (error: unknown) {
        if (active && !(error instanceof DOMException && error.name === "AbortError")) {
          setUnavailable(true);
        }
      } finally {
        if (active && controller === requestController) {
          controller = undefined;
          schedule();
        }
      }
    };

    const resume = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = undefined;
      schedule(150);
    };

    void poll();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      active = false;
      controller?.abort();
      if (timeout !== undefined) window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  }, [endpoint, english]);

  async function markRead(id: string): Promise<void> {
    if (csrfToken === undefined) return;
    const current = items.find((item) => item.id === id);
    if (current?.readAt !== undefined) return;
    setItems((value) =>
      value.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item)),
    );
    setUnreadCount((value) => Math.max(0, value - 1));
    const body = new URLSearchParams({ csrfToken });
    try {
      const response = await fetch(`${endpoint}/${encodeURIComponent(id)}/read`, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) throw new Error("notification read failed");
    } catch {
      // The next poll reconciles optimistic state.
    }
  }

  async function markAllRead(): Promise<void> {
    if (csrfToken === undefined || unreadCount === 0 || markingAllRead) return;
    setMarkingAllRead(true);
    const readAt = new Date().toISOString();
    setItems((value) => value.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    setUnreadCount(0);
    const body = new URLSearchParams({ csrfToken });
    try {
      const response = await fetch(`${endpoint}/read-all`, {
        method: "POST",
        body,
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!response.ok) throw new Error("notifications read-all failed");
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function toggleSound(): Promise<void> {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    window.localStorage.setItem(notificationSoundPreferenceKey, next ? "enabled" : "disabled");
    if (next) {
      playNotificationTone(audioContextRef);
      if ("Notification" in window && Notification.permission === "default") {
        try {
          await Notification.requestPermission();
        } catch {
          // In-app sound and counter continue if system notifications are unavailable.
        }
      }
    }
  }

  return (
    <div className="relative">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={
          english ? `Notifications, ${unreadCount} unread` : `الإشعارات، ${unreadCount} غير مقروء`
        }
        className="relative grid size-11 place-items-center rounded-2xl border border-current/10 bg-white/10 text-current transition hover:bg-white/15"
        onClick={() => {
          if (open) {
            closePanel();
            return;
          }
          setLoading(true);
          setOpen(true);
          window.setTimeout(() => setLoading(false), 180);
        }}
        ref={triggerRef}
        type="button"
      >
        <BellIcon className="size-5" />
        {unreadCount > 0 ? (
          <span className="absolute -end-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <section
          aria-label={english ? "Notification center" : "مركز الإشعارات"}
          className="fixed inset-x-3 top-20 z-50 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden rounded-[1.5rem] border border-[var(--itq-color-border)] bg-white text-[var(--itq-color-ink)] shadow-[var(--itq-shadow-float)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-14 sm:w-[25rem]"
          id={panelId}
          role="dialog"
        >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[var(--itq-color-border)] px-4 py-3.5 sm:flex-nowrap">
            <div className="min-w-0">
              <h2 className="font-black">{english ? "Notifications" : "الإشعارات"}</h2>
              <p className="mt-0.5 text-[11px] font-bold text-[var(--itq-color-muted)]">
                {english ? `${unreadCount} unread` : `${unreadCount} غير مقروء`}
              </p>
            </div>
            <div className="ms-auto flex flex-wrap items-center justify-end gap-1.5">
              <button
                className="min-h-9 rounded-xl bg-[var(--itq-color-surface-soft)] px-3 text-[11px] font-black text-[var(--itq-color-brand-800)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={unreadCount === 0 || markingAllRead || csrfToken === undefined}
                onClick={() => void markAllRead()}
                type="button"
              >
                {markingAllRead
                  ? english
                    ? "Saving…"
                    : "جارٍ الحفظ…"
                  : english
                    ? "Read all"
                    : "قراءة الكل"}
              </button>
              <button
                aria-pressed={soundEnabled}
                className={`min-h-9 rounded-xl px-3 text-[11px] font-black ${
                  soundEnabled
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-[var(--itq-color-surface-soft)] text-[var(--itq-color-muted)]"
                }`}
                onClick={() => void toggleSound()}
                type="button"
              >
                {soundEnabled
                  ? english
                    ? "Sound on"
                    : "الصوت مفعّل"
                  : english
                    ? "Enable sound"
                    : "تفعيل الصوت"}
              </button>
              <button
                aria-label={english ? "Close notifications" : "إغلاق الإشعارات"}
                className="grid size-9 place-items-center rounded-xl bg-[var(--itq-color-surface-soft)]"
                onClick={() => closePanel()}
                ref={closeButtonRef}
                type="button"
              >
                <CloseIcon className="size-4" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-2" role="log">
            {unavailable ? (
              <p className="m-2 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-900">
                {english
                  ? "Notifications are temporarily unavailable. Messages remain available in chat."
                  : "الإشعارات غير متاحة مؤقتاً. تبقى الرسائل متاحة داخل المحادثة."}
              </p>
            ) : null}
            {loading && items.length === 0 ? (
              <p className="p-8 text-center text-sm text-[var(--itq-color-muted)]">
                {english ? "Loading…" : "جارٍ التحميل…"}
              </p>
            ) : items.length === 0 ? (
              <div className="grid min-h-52 place-items-center p-8 text-center">
                <div>
                  <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
                    <CheckIcon className="size-6" />
                  </span>
                  <p className="mt-3 font-black">
                    {english ? "You're all caught up" : "كل شيء محدّث"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--itq-color-muted)]">
                    {english
                      ? "New messages and request updates appear here."
                      : "تظهر هنا الرسائل وتحديثات الطلبات الجديدة."}
                  </p>
                </div>
              </div>
            ) : (
              items.map((item) => {
                const text = localized(item, english);
                const href = localizedNotificationHref(item.actionHref, locale, surface);
                return (
                  <Link
                    className={`mb-1 block rounded-2xl border p-3.5 transition hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)] ${
                      item.readAt === undefined
                        ? "border-[var(--itq-color-brand-100)] bg-[var(--itq-color-brand-50)]/60"
                        : "border-transparent"
                    }`}
                    href={href}
                    key={item.id}
                    onClick={() => {
                      void markRead(item.id);
                      closePanel({ restoreFocus: false });
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1 size-2.5 shrink-0 rounded-full ${
                          item.readAt === undefined
                            ? "bg-[var(--itq-color-brand-600)]"
                            : "bg-[var(--itq-color-border)]"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black" dir="auto">
                          {text.title}
                        </p>
                        {text.body === undefined ? null : (
                          <p
                            className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--itq-color-muted)]"
                            dir="auto"
                          >
                            {text.body}
                          </p>
                        )}
                        <time
                          className="mt-2 block text-[10px] font-bold text-[var(--itq-color-muted)]"
                          dateTime={item.createdAt}
                        >
                          {new Intl.DateTimeFormat(english ? "en-GB" : "ar-SA", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(item.createdAt))}
                        </time>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
