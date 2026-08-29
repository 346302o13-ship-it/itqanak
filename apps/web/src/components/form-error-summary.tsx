"use client";

import { useEffect, useRef } from "react";

/**
 * A form-level error banner that takes keyboard focus when it appears, so a
 * failed submit lands the user on the explanation instead of leaving them at
 * the bottom of the form wondering what happened. Individual fields still carry
 * their own `aria-invalid` / `aria-describedby` messages.
 */
export function FormErrorSummary({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <div
      className={
        className ??
        "rounded-xl border border-[var(--itq-color-danger-600)] bg-[var(--itq-color-danger-100)] p-4 text-sm font-bold text-[var(--itq-color-danger-800)] outline-none"
      }
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      {children}
    </div>
  );
}
