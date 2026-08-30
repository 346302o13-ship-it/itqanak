"use client";

import { useEffect } from "react";

function urlBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/gu, "+").replace(/_/gu, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) view[index] = raw.charCodeAt(index);
  return buffer;
}

/**
 * Registers the notification service worker and keeps a Web Push subscription
 * on file for this browser whenever the visitor has granted notifications, so
 * platform notifications reach the phone's tray even when the app is closed —
 * like a messaging app. Silent no-op when unsupported or not configured.
 */
export function PushRegistrar({ csrfToken }: { readonly csrfToken: string | undefined }) {
  useEffect(() => {
    if (
      csrfToken === undefined ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator) ||
      typeof window === "undefined" ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return undefined;
    }

    let cancelled = false;

    const sync = async (): Promise<void> => {
      try {
        if (Notification.permission !== "granted") return;
        const keyResponse = await fetch("/api/push/vapid-key", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const keyPayload = (await keyResponse.json().catch(() => ({}))) as {
          enabled?: boolean;
          publicKey?: string | null;
        };
        if (!keyPayload.enabled || !keyPayload.publicKey || cancelled) return;

        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        if (cancelled) return;

        let subscription = await registration.pushManager.getSubscription();
        if (subscription === null) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToArrayBuffer(keyPayload.publicKey),
          });
        }
        if (cancelled) return;

        const json = subscription.toJSON();
        const body = new URLSearchParams({
          csrfToken,
          endpoint: subscription.endpoint,
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
          userAgent: navigator.userAgent.slice(0, 400),
        });
        await fetch("/api/push/subscribe", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body,
        });
      } catch {
        // Push is a best-effort enhancement; the in-app bell stays authoritative.
      }
    };

    void sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [csrfToken]);

  return null;
}
