import type { JSX } from "react";

import { classNames } from "./class-names.js";

interface BrandMarkProps {
  readonly className?: string;
  readonly label?: string;
}

export function BrandMark({ className, label = "إتقانك" }: BrandMarkProps): JSX.Element {
  return (
    <span
      aria-label={label}
      className={classNames(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-[0.95rem] bg-[var(--itq-color-brand-800)] text-white shadow-[var(--itq-shadow-sm)] ring-1 ring-white/20",
        className,
      )}
      role="img"
    >
      <svg aria-hidden="true" className="size-7" fill="none" viewBox="0 0 32 32">
        <path
          d="M8.5 15.5c0-4.9 3-8 7.5-8s7.5 3.1 7.5 8v8.25"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2.6"
        />
        <path
          d="m10.3 20.1 4.1 4.1 8.5-9"
          stroke="var(--itq-color-accent-200)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        <path
          d="M13 4.1h6"
          stroke="var(--itq-color-accent-200)"
          strokeLinecap="round"
          strokeWidth="2.4"
        />
      </svg>
    </span>
  );
}
