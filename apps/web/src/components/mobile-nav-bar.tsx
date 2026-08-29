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

const tabBase =
  "relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center text-[11px] font-black active:scale-95";
const tabActive =
  "text-[var(--itq-color-brand-strong)] before:absolute before:-top-0.5 before:h-1 before:w-6 before:rounded-full before:bg-[var(--itq-color-brand-strong)]";
const tabIdle = "text-[var(--itq-color-muted)]";

/**
 * Bottom tab bar for phones: a few fixed tabs plus a "More" sheet for the rest.
 * Sits above the home indicator (safe-area) with a blurred bar and an
 * app-style active indicator, so an installed shortcut feels native.
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
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label={moreLabel}
            className="itq-safe-b absolute inset-x-3 bottom-0 grid grid-cols-3 gap-2 rounded-t-3xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] p-3 pt-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <span
              aria-hidden
              className="col-span-3 mx-auto -mt-1 mb-1 h-1 w-10 rounded-full bg-[var(--itq-color-border-strong)]"
            />
            {rest.map((item) => (
              <Link
                aria-current={item.active ? "page" : undefined}
                className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-center text-[11px] font-black active:scale-95 ${
                  item.active
                    ? "bg-[var(--itq-color-brand-50)] text-[var(--itq-color-brand-strong)]"
                    : "text-[var(--itq-color-muted)]"
                }`}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <item.icon className="size-[22px]" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      ) : null}

      <nav
        aria-label={ariaLabel}
        className="itq-safe-b fixed inset-x-0 bottom-0 z-40 flex gap-1 border-t border-[var(--itq-color-border)] bg-[var(--itq-color-surface)]/90 px-2 pt-1.5 shadow-[0_-8px_24px_rgb(0_0_0_/_6%)] backdrop-blur-xl lg:hidden"
      >
        {primary.map((item) => (
          <Link
            aria-current={item.active ? "page" : undefined}
            className={`${tabBase} ${item.active ? tabActive : tabIdle}`}
            href={item.href}
            key={item.href}
          >
            <item.icon className="size-[22px]" />
            {item.label}
          </Link>
        ))}
        {rest.length > 0 ? (
          <button
            aria-expanded={open}
            className={`${tabBase} ${open || restActive ? tabActive : tabIdle}`}
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? <CloseIcon className="size-[22px]" /> : <MoreIcon className="size-[22px]" />}
            {moreLabel}
          </button>
        ) : null}
      </nav>
    </>
  );
}
