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
            "inline-flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-[var(--itq-color-brand-strong)]",
            align === "center" && "justify-center",
          )}
        >
          <span aria-hidden="true" className="h-px w-5 bg-[var(--itq-color-accent-500)]" />
          {eyebrow}
        </p>
      )}
      <h2
        className="mt-3 text-[1.7rem] font-black leading-[1.15] tracking-[-0.015em] text-[var(--itq-color-ink)] sm:text-[2.05rem]"
        id={titleId}
      >
        {title}
      </h2>
      {description === undefined ? null : (
        <p className="mt-4 text-[0.98rem] leading-7 text-[var(--itq-color-muted)] sm:text-base">
          {description}
        </p>
      )}
    </div>
  );
}
