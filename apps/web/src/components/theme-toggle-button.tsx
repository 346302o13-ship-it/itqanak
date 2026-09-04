"use client";

import { useLayoutEffect, useState } from "react";

import { applyChoice, effectiveTheme, readChoice, type ThemeChoice } from "./theme-toggle";

/**
 * Compact icon-only appearance toggle for headers (visitor pages, the student
 * shell) — a plain light/dark switch, unlike the three-way System/Light/Dark
 * `ThemeToggle` in account settings. Clicking always picks an explicit choice,
 * flipping whatever is effectively showing right now.
 *
 * The sun/moon icons are shown or hidden with pure CSS (`.itq-theme-icon-*`
 * rules in globals.css, mirroring the `data-theme`/`prefers-color-scheme`
 * pattern in tokens.css) so the correct icon is already right on first paint —
 * no post-mount flicker, no hydration-mismatch guard needed for the icon
 * itself. Only the click handler needs JavaScript.
 */
export function ThemeToggleButton({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const english = locale === "en";
  const [choice, setChoice] = useState<ThemeChoice>("system");

  // Mirrors ThemeToggle's Strict-mode remount guard: re-apply the stored
  // choice in case dev-mode reset <html> to its JSX attributes.
  useLayoutEffect(() => {
    const stored = readChoice();
    setChoice(stored);
    applyChoice(stored);
  }, []);

  function toggle(): void {
    const next: ThemeChoice = effectiveTheme(choice) === "dark" ? "light" : "dark";
    setChoice(next);
    applyChoice(next);
  }

  return (
    <button
      aria-label={english ? "Switch appearance (light/dark)" : "تبديل المظهر (فاتح/داكن)"}
      className="itq-theme-toggle-btn inline-flex size-11 items-center justify-center rounded-[var(--itq-radius-control)] border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-[var(--itq-color-ink)] transition hover:bg-[var(--itq-color-brand-50)]"
      onClick={toggle}
      type="button"
    >
      <svg aria-hidden="true" className="itq-theme-icon-sun size-5" fill="none" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
      <svg
        aria-hidden="true"
        className="itq-theme-icon-moon size-5"
        fill="none"
        viewBox="0 0 24 24"
      >
        <path
          d="M20.5 14.7A8.5 8.5 0 1 1 9.3 3.5a7 7 0 0 0 11.2 11.2Z"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </button>
  );
}
