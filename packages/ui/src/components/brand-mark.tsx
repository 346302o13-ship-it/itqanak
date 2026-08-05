import type { JSX } from "react";

import { classNames } from "./class-names.js";

interface BrandMarkProps {
  readonly className?: string;
  readonly label?: string;
}

/** A deliberately modest temporary mark until the product identity is finalized. */
export function BrandMark({ className, label = "إتقانك" }: BrandMarkProps): JSX.Element {
  return (
    <span
      aria-label={label}
      className={classNames(
        "inline-flex size-10 items-center justify-center rounded-2xl bg-[var(--itq-color-brand-700)] text-xl font-extrabold text-white shadow-sm",
        className,
      )}
      role="img"
    >
      إ
    </span>
  );
}
