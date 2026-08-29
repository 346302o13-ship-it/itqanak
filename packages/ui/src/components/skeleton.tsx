import type { HTMLAttributes, JSX } from "react";

import { classNames } from "./class-names.js";

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Tailwind size/shape utilities, e.g. "h-6 w-40 rounded-lg". */
  readonly className?: string;
}

/**
 * A single shimmering placeholder block. Compose several to shape a route's
 * loading.tsx after its real layout so navigation reads as instant instead of a
 * frozen previous page. Honours prefers-reduced-motion via `motion-reduce`.
 */
export function Skeleton({ className, ...props }: SkeletonProps): JSX.Element {
  return (
    <div
      aria-hidden="true"
      {...props}
      className={classNames(
        "animate-pulse rounded-lg bg-[color:var(--itq-color-surface-soft)] motion-reduce:animate-none",
        className,
      )}
    />
  );
}
