import type { ComponentPropsWithoutRef, JSX } from "react";

import { classNames } from "./class-names.js";

type ButtonVariant = "primary" | "secondary" | "quiet";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  readonly variant?: ButtonVariant;
}

const variantClasses: Readonly<Record<ButtonVariant, string>> = {
  primary:
    "bg-[var(--itq-color-brand-700)] text-white shadow-[var(--itq-shadow-sm)] hover:-translate-y-0.5 hover:bg-[var(--itq-color-brand-800)] focus-visible:outline-[var(--itq-color-brand-600)]",
  secondary:
    "border border-[var(--itq-color-border-strong)] bg-white text-[var(--itq-color-brand-800)] shadow-sm hover:border-[var(--itq-color-brand-200)] hover:bg-[var(--itq-color-brand-50)] focus-visible:outline-[var(--itq-color-brand-600)]",
  quiet:
    "text-[var(--itq-color-brand-800)] hover:bg-[var(--itq-color-brand-50)] focus-visible:outline-[var(--itq-color-brand-600)]",
};

export function Button({
  className,
  type = "button",
  variant = "primary",
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      {...props}
      className={classNames(
        "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50",
        variantClasses[variant],
        className,
      )}
      type={type}
    />
  );
}
