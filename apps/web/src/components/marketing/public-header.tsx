"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { BrandMark, classNames } from "@itqanak/ui";

import { InstallAppButton } from "../install-app-button";

import type { MarketingLocale } from "./whatsapp-link";

interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly current?: boolean;
}

interface PublicHeaderProps {
  readonly locale: MarketingLocale;
  readonly brandName: string;
  readonly brandDescriptor: string;
  readonly navigationLabel: string;
  readonly loginLabel: string;
  readonly languageLabel: string;
  readonly languageName: string;
  readonly homeHref: string;
  readonly oppositeHref: string;
  readonly oppositeLocale: MarketingLocale;
  readonly loginHref: string;
  readonly items: readonly NavItem[];
}

export function PublicHeader({
  brandDescriptor,
  brandName,
  homeHref,
  items,
  languageLabel,
  languageName,
  locale,
  loginHref,
  loginLabel,
  navigationLabel,
  oppositeHref,
  oppositeLocale,
}: PublicHeaderProps) {
  const english = locale === "en";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={classNames(
        "itq-safe-t sticky top-0 z-50 border-b transition-colors duration-300",
        scrolled || open
          ? "border-[var(--itq-color-border)] bg-[var(--itq-color-canvas)]/92 shadow-[var(--itq-shadow-sm)] backdrop-blur-xl"
          : "border-transparent bg-[var(--itq-color-canvas)]/70 backdrop-blur-lg",
      )}
    >
      <div className="mx-auto flex min-h-[4.75rem] w-full max-w-[80rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link className="inline-flex shrink-0 items-center gap-3 rounded-xl" href={homeHref}>
          <BrandMark label={brandName} />
          <span className="leading-tight">
            <span className="block text-lg font-black">{brandName}</span>
            <span className="mt-0.5 hidden text-[0.68rem] font-bold text-[var(--itq-color-muted)] sm:block">
              {brandDescriptor}
            </span>
          </span>
        </Link>

        <nav
          aria-label={navigationLabel}
          className="hidden items-center gap-0.5 text-sm font-black lg:flex"
        >
          {items.map((item) => (
            <Link
              aria-current={item.current ? "page" : undefined}
              className={classNames(
                "rounded-xl px-3.5 py-2.5 transition hover:bg-[var(--itq-color-surface)]",
                item.current &&
                  "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)]",
              )}
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <Link
            aria-label={languageLabel}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-xs font-black text-[var(--itq-color-brand-strong)] shadow-sm transition hover:bg-[var(--itq-color-brand-50)]"
            href={oppositeHref}
            hrefLang={oppositeLocale}
            lang={oppositeLocale}
          >
            {languageName}
          </Link>
          <Link
            className="hidden min-h-11 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white transition hover:bg-[var(--itq-color-brand-800)] sm:inline-flex"
            href={loginHref}
          >
            {loginLabel}
          </Link>
          <button
            aria-controls="public-mobile-nav"
            aria-expanded={open}
            aria-label={navigationLabel}
            className="inline-flex size-11 items-center justify-center rounded-xl border border-[var(--itq-color-border)] bg-[var(--itq-color-surface)] text-[var(--itq-color-ink)] shadow-sm lg:hidden"
            onClick={() => setOpen((value) => !value)}
            type="button"
          >
            {open ? (
              <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
                <path
                  d="m6 6 12 12M18 6 6 18"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            ) : (
              <svg aria-hidden="true" fill="none" height="22" viewBox="0 0 24 24" width="22">
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="border-t border-[var(--itq-color-border)] bg-[var(--itq-color-canvas)]/97 backdrop-blur-xl lg:hidden"
          id="public-mobile-nav"
        >
          <nav
            aria-label={navigationLabel}
            className="mx-auto grid w-full max-w-[80rem] gap-1 px-4 py-4 text-base font-black sm:px-6"
          >
            {items.map((item) => (
              <Link
                aria-current={item.current ? "page" : undefined}
                className={classNames(
                  "rounded-xl px-4 py-3 transition hover:bg-[var(--itq-color-surface)]",
                  item.current &&
                    "bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)]",
                )}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              className="mt-2 inline-flex min-h-12 items-center justify-center rounded-[var(--itq-radius-control)] bg-[var(--itq-color-brand-700)] px-5 text-sm font-black text-white"
              href={loginHref}
              onClick={() => setOpen(false)}
            >
              {loginLabel}
            </Link>
            <div className="mt-1">
              <InstallAppButton locale={locale} surface="public" variant="hero" />
            </div>
            <p className="mt-2 px-1 text-[0.7rem] font-bold text-[var(--itq-color-muted)]">
              {english
                ? "Secure connection · private files · academic-integrity commitment"
                : "اتصال آمن · ملفات خاصة · التزام بالنزاهة الأكاديمية"}
            </p>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
