"use client";

import { useEffect, useState } from "react";

import { soundEnabled, soundPreferenceKey } from "@/lib/ui-sounds";

import { InstallAppButton } from "./install-app-button";

type PermissionState = "unsupported" | "default" | "granted" | "denied";

/**
 * One place for the per-device notification preferences that otherwise live
 * scattered in the notification bell: the sound cue, the OS-notification
 * permission, and installing the app. All state is local to this browser.
 */
export function NotificationPreferences({ locale }: Readonly<{ locale: "ar" | "en" }>) {
  const english = locale === "en";
  const [sound, setSound] = useState(true);
  const [permission, setPermission] = useState<PermissionState>("default");

  useEffect(() => {
    try {
      setSound(soundEnabled(window.localStorage.getItem(soundPreferenceKey)));
    } catch {
      setSound(true);
    }
    setPermission(
      typeof window === "undefined" || !("Notification" in window)
        ? "unsupported"
        : (Notification.permission as PermissionState),
    );
  }, []);

  function toggleSound(): void {
    const next = !sound;
    setSound(next);
    try {
      window.localStorage.setItem(soundPreferenceKey, next ? "enabled" : "disabled");
    } catch {
      /* private mode — the toggle is best-effort */
    }
  }

  async function askPermission(): Promise<void> {
    if (!("Notification" in window)) return;
    try {
      const result = await Notification.requestPermission();
      setPermission(result as PermissionState);
    } catch {
      /* ignore */
    }
  }

  const permissionLabel =
    permission === "granted"
      ? english
        ? "Device notifications are on"
        : "إشعارات الجهاز مفعّلة"
      : permission === "denied"
        ? english
          ? "Blocked in the browser settings"
          : "محجوبة من إعدادات المتصفح"
        : permission === "unsupported"
          ? english
            ? "This browser has no notifications"
            : "هذا المتصفح لا يدعم الإشعارات"
          : english
            ? "Off — turn on to get alerts when the app is closed"
            : "متوقفة — فعّلها لتصلك التنبيهات والتطبيق مغلق";

  return (
    <div className="mt-4 grid gap-4">
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3">
        <div className="min-w-0">
          <p className="text-sm font-black">{english ? "Notification sound" : "صوت الإشعارات"}</p>
          <p className="mt-0.5 text-xs text-[var(--itq-color-muted)]">
            {english ? "A short chime on new messages." : "نغمة قصيرة عند وصول رسالة جديدة."}
          </p>
        </div>
        <button
          aria-pressed={sound}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            sound ? "bg-[var(--itq-color-brand-600)]" : "bg-[var(--itq-color-border-strong)]"
          }`}
          onClick={() => toggleSound()}
          type="button"
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-[var(--itq-color-surface)] shadow transition-all ${
              sound ? "start-6" : "start-1"
            }`}
          />
        </button>
      </div>

      <div className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3">
        <p className="text-sm font-black">{english ? "Device notifications" : "إشعارات الجهاز"}</p>
        <p className="mt-0.5 text-xs text-[var(--itq-color-muted)]">{permissionLabel}</p>
        {permission === "default" ? (
          <button
            className="mt-2 inline-flex min-h-10 items-center rounded-xl bg-[var(--itq-color-brand-700)] px-4 text-xs font-black text-white"
            onClick={() => void askPermission()}
            type="button"
          >
            {english ? "Enable device notifications" : "تفعيل إشعارات الجهاز"}
          </button>
        ) : null}
      </div>

      <div className="rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3">
        <p className="text-sm font-black">{english ? "Install the app" : "تثبيت التطبيق"}</p>
        <p className="mt-0.5 text-xs text-[var(--itq-color-muted)]">
          {english
            ? "Add it to your home screen to open it like a native app."
            : "أضفه إلى الشاشة الرئيسية لفتحه كتطبيق."}
        </p>
        <div className="mt-2">
          <InstallAppButton locale={locale} surface="public" />
        </div>
      </div>
    </div>
  );
}
