"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

import { ChevronIcon } from "@/components/icons";

/**
 * Collapses a list's filter form behind a single button on phones so the screen
 * is not buried under inputs on first load. From the `md` breakpoint up the
 * button disappears and the form is always shown inline, unchanged.
 */
export function FilterDisclosure({
  activeCount = 0,
  children,
  className = "mt-7",
  label,
}: Readonly<{
  activeCount?: number;
  children: ReactNode;
  className?: string;
  label: string;
}>) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <div className={className}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-[var(--itq-color-brand-50)] px-5 py-3 text-sm font-black text-[var(--itq-color-ink)] md:hidden"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="inline-flex items-center gap-2">
          {label}
          {activeCount > 0 ? (
            <span className="grid min-w-5 place-items-center rounded-full bg-[var(--itq-color-brand-700)] px-1.5 text-xs font-black text-white">
              {activeCount}
            </span>
          ) : null}
        </span>
        <ChevronIcon className={`size-4 transition ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      <div className={`${open ? "mt-3 block" : "hidden"} md:mt-0 md:block`} id={panelId}>
        {children}
      </div>
    </div>
  );
}
