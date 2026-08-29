"use client";

import { useState, type ComponentType, type SVGProps } from "react";
import Link from "next/link";

import { CloseIcon, MoreIcon } from "./icons";

export interface MobileNavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: ComponentType<SVGProps<SVGSVGElement>>;
  readonly active: boolean;
}

interface MobileNavBarProps {
  readonly items: readonly MobileNavItem[];
  readonly ariaLabel: string;
  readonly moreLabel: string;
  readonly primaryCount?: number;
}

/**
 * Bottom nav for phones: a few fixed tabs plus a "More" sheet for the rest,
 * instead of a sideways-scrolling strip where half the sections are unreachable.
 */
export function MobileNavBar({ items, ariaLabel, moreLabel, primaryCount = 4 }: MobileNavBarProps) {
  const [open, setOpen] = useState(false);
  const primary = items.slice(0, primaryCount);
  const rest = items.slice(primaryCount);
  const restActive = rest.some((item) => item.active);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label={moreLabel}
            className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            {rest.map((item) => (
              <Link
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-black ${
                  item.active
                    ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                    : "text-[var(--itq-color-muted)]"
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <item.icon className="size-5" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      <nav
        aria-label={ariaLabel}
        className="fixed inset-x-3 bottom-3 z-40 flex gap-1 rounded-2xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]/95 p-1.5 shadow-xl backdrop-blur lg:hidden"
      >
        {primary.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-black ${
              item.active
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                : "text-[var(--itq-color-muted)]"
            }`}
            href={item.href}
            key={item.href}
          >
            <item.icon className="size-5" />
            {item.label}
          </Link>
        ))}
        {rest.length > 0 ? (
          <button
            aria-expanded={open}
            className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-black ${
              open || restActive
                ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                : "text-[var(--itq-color-muted)]"
            }`}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <CloseIcon className="size-5" /> : <MoreIcon className="size-5" />}
            {moreLabel}
          </button>
        ) : null}
      </nav>
    </>
  );
}
