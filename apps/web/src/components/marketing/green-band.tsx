import type { CSSProperties, JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";

/** A faint eight-point-star field (two overlapping squares), inline SVG data URI
 *  so it never leaves the origin under the app's `img-src 'self' data:` CSP. */
const patternStyle: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='128' height='128' viewBox='0 0 128 128'%3E%3Cg fill='none' stroke='%23ffffff' stroke-width='1.2'%3E%3Crect x='34' y='34' width='60' height='60'/%3E%3Crect x='34' y='34' width='60' height='60' transform='rotate(45 64 64)'/%3E%3C/g%3E%3C/svg%3E\")",
  backgroundSize: "128px 128px",
};

interface GreenBandProps {
  readonly children: ReactNode;
  readonly className?: string;
  /** Break out to (near) the full viewport width. Default on. */
  readonly bleed?: boolean;
  /** `compact` for the hero, `regular` for the CTA bands. */
  readonly size?: "compact" | "regular";
  readonly ariaLabelledBy?: string;
}

/**
 * The shared institutional green band used across the visitor pages — a rich,
 * near-flat green with one soft corner light, a very faint geometric field, a
 * gold hairline and a grounding fade. Every band re-constrains its content to
 * the page's 80rem column so text stays aligned with the rest of the page.
 */
export function GreenBand({
  ariaLabelledBy,
  bleed = true,
  children,
  className,
  size = "regular",
}: GreenBandProps): JSX.Element {
  return (
    <section
      aria-labelledby={ariaLabelledBy}
      className={classNames(
        "relative isolate overflow-hidden bg-[linear-gradient(180deg,var(--itq-color-brand-800),var(--itq-color-brand-900))] text-white",
        bleed && "itq-bleed",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(72rem_34rem_at_14%_-16%,rgb(255_255_255/0.09),transparent_62%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={patternStyle}
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-[var(--itq-color-accent-500)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-[linear-gradient(180deg,transparent,rgb(0_0_0/0.16))]"
      />
      <div
        className={classNames(
          "relative mx-auto w-full max-w-[80rem] px-4 sm:px-6 lg:px-8",
          size === "compact" ? "py-10 sm:py-12" : "py-16 sm:py-20",
        )}
      >
        {children}
      </div>
    </section>
  );
}
