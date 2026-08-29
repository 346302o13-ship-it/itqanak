"use client";

import { useEffect, useState } from "react";

import { CloseIcon } from "./icons";

interface ActiveAnnouncement {
  readonly level: "INFO" | "WARNING" | "CRITICAL";
  readonly ar: string;
  readonly en: string;
  readonly publishedAt?: string;
}

const dismissKey = "itqanak.announcement.dismissed.v1";

function hash(value: string): string {
  let h = 0;
  for (let index = 0; index < value.length; index += 1) {
    h = (h << 5) - h + value.charCodeAt(index);
    h |= 0;
  }
  return String(h);
}

const tone: Readonly<Record<ActiveAnnouncement["level"], string>> = {
  INFO: "border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]",
  WARNING:
    "border-[var(--itq-color-warning-200)] bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-950)]",
  CRITICAL:
    "border-[var(--itq-color-danger-200)] bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-900)]",
};

/**
 * Platform-wide broadcast set by an administrator. Shown once per message per
 * device; a CRITICAL announcement cannot be dismissed.
 */
export function AnnouncementBanner({ locale = "ar" }: { readonly locale?: "ar" | "en" }) {
  const english = locale === "en";
  const [announcement, setAnnouncement] = useState<ActiveAnnouncement>();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/announcements/active", {
          cache: "no-store",
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { announcement?: ActiveAnnouncement | null };
        if (!active) return;
        const next = payload.announcement ?? undefined;
        setAnnouncement(next);
        if (next === undefined) return;
        let seen: string | null = null;
        try {
          seen = window.localStorage.getItem(dismissKey);
        } catch {
          seen = null;
        }
        setDismissed(next.level !== "CRITICAL" && seen === hash(next.ar + next.en));
      } catch {
        // A missing banner is not an error worth surfacing.
      }
    };
    void load();
    const timer = window.setInterval(load, 120_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  if (announcement === undefined || dismissed) return null;
  const text = english ? announcement.en : announcement.ar;

  return (
    <div
      className={`mx-auto flex max-w-[92rem] items-start gap-3 border-b px-4 py-3 text-sm font-bold leading-6 sm:px-7 ${tone[announcement.level]}`}
      role="status"
    >
      <p className="min-w-0 flex-1 whitespace-pre-wrap" dir="auto">
        {text}
      </p>
      {announcement.level === "CRITICAL" ? null : (
        <button
          aria-label={english ? "Dismiss" : "إخفاء"}
          className="shrink-0 rounded-lg p-1 hover:bg-black/5"
          onClick={() => {
            setDismissed(true);
            try {
              window.localStorage.setItem(dismissKey, hash(announcement.ar + announcement.en));
            } catch {
              // Best effort — it reappears next load if storage is unavailable.
            }
          }}
          type="button"
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
