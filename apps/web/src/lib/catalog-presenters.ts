/**
 * A short "starting from" price line for a public catalog service. Returns
 * undefined for quote-only / free services so the caller renders nothing.
 * The NUMERIC string from the database is used directly for display only.
 */
export function startingPriceLabel(
  pricingModel: string,
  basePrice: string | null,
  currency: string | null,
  locale: "ar" | "en",
): string | undefined {
  if (
    (pricingModel !== "STARTING_FROM" && pricingModel !== "FIXED") ||
    basePrice === null ||
    currency === null
  ) {
    return undefined;
  }
  const amount = Number.parseFloat(basePrice);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const formatted = new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
  if (pricingModel === "FIXED") return formatted;
  return locale === "ar" ? `يبدأ من ${formatted}` : `From ${formatted}`;
}
