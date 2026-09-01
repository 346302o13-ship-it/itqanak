import type { JSX } from "react";

import { classNames } from "@itqanak/ui";

interface SectionIntroProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description?: string;
  readonly align?: "start" | "center";
  readonly className?: string;
  readonly titleId?: string;
}

export function SectionIntro({
  align = "start",
  className,
  description,
  eyebrow,
  title,
  titleId,
}: SectionIntroProps): JSX.Element {
  return (
    <div
      className={classNames("max-w-3xl", align === "center" && "mx-auto text-center", className)}
    >
      {eyebrow === undefined ? null : (
        <p
          className={classNames(
            "inline-flex items-center gap-2 rounded-full border border-[var(--itq-color-brand-200)] bg-[var(--itq-color-brand-50)] px-3.5 py-1.5 text-[0.7rem] font-black uppercase tracking-[0.08em] text-[var(--itq-color-brand-strong)]",
            align === "center" && "mx-auto",
          )}
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full bg-[var(--itq-color-brand-strong)]"
          />
          {eyebrow}
        </p>
      )}
      <h2
        className="mt-4 text-3xl font-black leading-[1.18] tracking-[-0.015em] text-[var(--itq-color-ink)] sm:text-[2.5rem]"
        id={titleId}
      >
        {title}
      </h2>
      <span
        aria-hidden="true"
        className={classNames(
          "mt-4 block h-1 w-16 rounded-full bg-[linear-gradient(90deg,var(--itq-color-brand-500),color-mix(in_srgb,var(--itq-color-accent-500)_75%,transparent))]",
          align === "center" && "mx-auto",
        )}
      />
      {description === undefined ? null : (
        <p className="mt-5 text-base leading-8 text-[var(--itq-color-muted)] sm:text-lg">
          {description}
        </p>
      )}
    </div>
  );
}
