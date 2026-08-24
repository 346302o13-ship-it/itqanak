import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";
import { SUPPORT_WHATSAPP_E164 } from "@/lib/support-contact";

import { MarketingIcon } from "./marketing-icon";

export type MarketingLocale = "ar" | "en";

export const supportWhatsAppNumber = SUPPORT_WHATSAPP_E164.slice(1);

const defaultCopy = {
  ar: {
    label: "تواصل عبر واتساب",
    accessibleLabel: "تواصل مع دعم إتقانك عبر واتساب — يفتح في نافذة جديدة",
  },
  en: {
    label: "Chat on WhatsApp",
    accessibleLabel: "Chat with ITQANAK support on WhatsApp — opens in a new window",
  },
} as const;

export function whatsappHref(message?: string): string {
  const base = `https://wa.me/${supportWhatsAppNumber}`;
  return message === undefined || message.trim().length === 0
    ? base
    : `${base}?text=${encodeURIComponent(message)}`;
}

interface WhatsAppLinkProps extends Omit<ComponentPropsWithoutRef<"a">, "children" | "href"> {
  readonly appearance?: "brand" | "light" | "glass";
  readonly locale?: MarketingLocale;
  readonly label?: ReactNode;
  readonly message?: string;
  readonly showIcon?: boolean;
}

export function WhatsAppLink({
  appearance = "brand",
  className,
  label,
  locale = "ar",
  message,
  showIcon = true,
  ...props
}: WhatsAppLinkProps): JSX.Element {
  const copy = defaultCopy[locale];
  return (
    <a
      {...props}
      aria-label={props["aria-label"] ?? copy.accessibleLabel}
      className={classNames(
        "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2",
        appearance === "brand" &&
          "bg-[#167d59] text-white shadow-[var(--itq-shadow-sm)] hover:bg-[#116c4c] focus-visible:outline-[#167d59]",
        appearance === "light" &&
          "border border-[var(--itq-color-border-strong)] bg-white text-[var(--itq-color-brand-800)] shadow-[var(--itq-shadow-sm)] hover:bg-[var(--itq-color-brand-50)] focus-visible:outline-white",
        appearance === "glass" &&
          "border border-white/20 bg-white/10 text-white shadow-none hover:bg-white/15 focus-visible:outline-white",
        className,
      )}
      href={whatsappHref(message)}
      rel="noreferrer noopener"
      target="_blank"
    >
      {showIcon ? <MarketingIcon className="size-5" name="message" /> : null}
      {label ?? copy.label}
    </a>
  );
}
