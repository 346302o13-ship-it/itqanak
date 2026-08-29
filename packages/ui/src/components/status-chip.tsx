import type { JSX } from "react";

import { classNames } from "./class-names.js";

type StatusTone = "info" | "success" | "warning" | "danger" | "neutral";

export interface StatusChipProps {
  readonly children: string;
  readonly tone?: StatusTone;
  readonly className?: string;
}

const toneClasses: Readonly<Record<StatusTone, string>> = {
  info: "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-800)]",
  success: "bg-[var(--itq-color-success-50)] text-[var(--itq-color-success-700)]",
  warning: "bg-[var(--itq-color-warning-50)] text-[var(--itq-color-warning-800)]",
  danger: "bg-[var(--itq-color-danger-50)] text-[var(--itq-color-danger-700)]",
  neutral: "bg-[var(--itq-color-neutral-50)] text-[var(--itq-color-neutral-700)]",
};

export function StatusChip({ children, className, tone = "info" }: StatusChipProps): JSX.Element {
  return (
    <span
      className={classNames(
        "inline-flex rounded-full px-3 py-1 text-xs font-bold",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
