"use client";

import { useEffect, useLayoutEffect, useState } from "react";

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "itq-theme";

function readChoice(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyChoice(choice: Choice): void {
  const root = document.documentElement;
  try {
    if (choice === "system") {
      delete root.dataset.theme;
      localStorage.removeItem(STORAGE_KEY);
    } else {
      root.dataset.theme = choice;
      localStorage.setItem(STORAGE_KEY, choice);
    }
  } catch {
    if (choice === "system") delete root.dataset.theme;
    else root.dataset.theme = choice;
  }
}

/**
 * Three-way appearance control: follow the device, or pin light / dark. The
 * choice is stored per-browser and re-applied before paint by a small script in
 * the root layout, so there is no flash on the next load.
 */
export function ThemeToggle({ locale = "ar" }: Readonly<{ locale?: "ar" | "en" }>) {
  const english = locale === "en";
  const [choice, setChoice] = useState<Choice>("system");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setChoice(readChoice());
    setReady(true);
  }, []);

  // React's dev-mode Strict remount resets <html> to its JSX attributes,
  // dropping the one the layout's inline script set. Re-apply it; a no-op in
  // production where there is no remount.
  useLayoutEffect(() => {
    applyChoice(readChoice());
  }, []);

  const options: readonly { value: Choice; label: string }[] = [
    { value: "system", label: english ? "System" : "النظام" },
    { value: "light", label: english ? "Light" : "فاتح" },
    { value: "dark", label: english ? "Dark" : "داكن" },
  ];

  return (
    <div
      aria-label={english ? "Appearance" : "المظهر"}
      className="inline-flex rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface-soft)] p-1"
      role="group"
    >
      {options.map((option) => {
        const active = ready && choice === option.value;
        return (
          <button
            aria-pressed={active}
            className={`min-h-9 rounded-lg px-3 text-xs font-black transition ${
              active
                ? "bg-[var(--itq-color-surface)] text-[var(--itq-color-ink)] shadow-sm"
                : "text-[var(--itq-color-muted)] hover:text-[var(--itq-color-ink)]"
            }`}
            key={option.value}
            onClick={() => {
              setChoice(option.value);
              applyChoice(option.value);
            }}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
