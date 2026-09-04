import { cookies } from "next/headers";
import type { ComponentPropsWithoutRef, JSX, ReactNode } from "react";

import { classNames } from "@itqanak/ui";
import { SUPPORT_WHATSAPP_E164 } from "@/lib/support-contact";
import { parseUtmCookie, utmCookieName } from "@/lib/utm-cookie";

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

/** Tags the opening WhatsApp message with the ad source that brought the
 *  student in (from the `itq_utm` cookie), so support can see which campaign
 *  a conversation started from without any extra tooling. Never blocks the
 *  link — a missing/malformed cookie just leaves the message as-is. */
async function withAttribution(
  message: string | undefined,
  locale: MarketingLocale,
): Promise<string | undefined> {
  const cookieStore = await cookies();
  const utm = parseUtmCookie(cookieStore.get(utmCookieName())?.value);
  if (utm === undefined) return message;
  const tag = locale === "en" ? `(via ${utm.s} ad)` : `(وصلت عبر إعلان ${utm.s})`;
  return message === undefined || message.trim().length === 0 ? tag : `${message} ${tag}`;
}

interface WhatsAppLinkProps extends Omit<ComponentPropsWithoutRef<"a">, "children" | "href"> {
  readonly appearance?: "brand" | "light" | "glass";
  readonly locale?: MarketingLocale;
  readonly label?: ReactNode;
  readonly message?: string;
  readonly showIcon?: boolean;
}

export async function WhatsAppLink({
  appearance = "brand",
  className,
  label,
  locale = "ar",
  message,
  showIcon = true,
  ...props
}: WhatsAppLinkProps): Promise<JSX.Element> {
  const copy = defaultCopy[locale];
  const taggedMessage = await withAttribution(message, locale);
  return (
    <a
      {...props}
      aria-label={props["aria-label"] ?? copy.accessibleLabel}
      className={classNames(
        "inline-flex min-h-12 items-center justify-center gap-2.5 rounded-xl px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2",
        appearance === "brand" &&
          "bg-[var(--itq-color-whatsapp-600)] text-white shadow-[var(--itq-shadow-sm)] hover:bg-[var(--itq-color-whatsapp-700)] focus-visible:outline-[var(--itq-color-whatsapp-600)]",
        appearance === "light" &&
          "border border-[var(--itq-color-border-strong)] bg-[var(--itq-color-surface)] text-[var(--itq-color-brand-strong)] shadow-[var(--itq-shadow-sm)] hover:bg-[var(--itq-color-brand-50)] focus-visible:outline-white",
        appearance === "glass" &&
          "border border-white/20 bg-white/10 text-white shadow-none hover:bg-white/15 focus-visible:outline-white",
        className,
      )}
      href={whatsappHref(taggedMessage)}
      rel="noreferrer noopener"
      target="_blank"
    >
      {showIcon ? <MarketingIcon className="size-5" name="message" /> : null}
      {label ?? copy.label}
    </a>
  );
}
