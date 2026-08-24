import type { HTMLAttributes, JSX, ReactNode } from "react";

import { classNames } from "./class-names.js";

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
}

export function Surface({ children, className, ...props }: SurfaceProps): JSX.Element {
  return (
    <section
      {...props}
      className={classNames(
        "rounded-3xl border border-[color:var(--itq-color-border)] bg-[var(--itq-color-surface)] p-6 shadow-[var(--itq-shadow-card)] sm:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}
