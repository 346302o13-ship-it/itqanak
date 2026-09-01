"use client";

import { useId, useState, type ComponentPropsWithoutRef } from "react";

type PasswordFieldProps = Omit<ComponentPropsWithoutRef<"input">, "type"> & {
  readonly locale?: "ar" | "en";
};

/**
 * A password input with a show/hide eye toggle. Server-rendered as a normal
 * password field; the toggle is pure enhancement and never changes the value.
 */
export function PasswordField({ locale = "ar", className, id, ...props }: PasswordFieldProps) {
  const english = locale === "en";
  const [visible, setVisible] = useState(false);
  const fallbackId = useId();
  // Keep any vertical-rhythm margin on the wrapper so the eye button, which is
  // absolutely positioned against the wrapper, lines up with the input box.
  const raw = (className ?? "").split(/\s+/u).filter(Boolean);
  const wrapperMargin = raw.filter((token) => /^-?m[trblxy]?-/u.test(token)).join(" ");
  const inputClass = raw.filter((token) => !/^-?m[trblxy]?-/u.test(token)).join(" ");
  return (
    <span className={`relative block ${wrapperMargin}`}>
      <input
        {...props}
        className={`${inputClass} pe-12`}
        id={id ?? fallbackId}
        type={visible ? "text" : "password"}
      />
      <button
        aria-label={
          visible
            ? english
              ? "Hide password"
              : "إخفاء كلمة المرور"
            : english
              ? "Show password"
              : "إظهار كلمة المرور"
        }
        aria-pressed={visible}
        className="absolute inset-y-0 end-0 grid w-12 place-items-center text-[var(--itq-color-muted)] hover:text-[var(--itq-color-ink)]"
        onClick={() => setVisible((value) => !value)}
        tabIndex={-1}
        type="button"
      >
        {visible ? (
          <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
            <path
              d="M3 3l18 18M10.6 10.7a2 2 0 002.7 2.9M9.9 5.2A9.5 9.5 0 0112 5c5 0 9 4.5 9.5 6.3a12.8 12.8 0 01-2.4 3.6M6.4 6.5A12.7 12.7 0 002.5 11c.4 1.6 3.8 6 9.5 6a9.7 9.7 0 003.3-.6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
          </svg>
        ) : (
          <svg aria-hidden="true" fill="none" height="20" viewBox="0 0 24 24" width="20">
            <path
              d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          </svg>
        )}
      </button>
    </span>
  );
}
