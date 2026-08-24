export const SUPPORT_WHATSAPP_E164 = "+966564202263" as const;

export function supportWhatsAppHref(locale: "ar" | "en" = "ar", context?: string): string {
  const safeContext = context
    ?.replace(/[\r\n\t]+/gu, " ")
    .trim()
    .slice(0, 160);
  const message =
    locale === "en"
      ? `Hello ITQANAK support. I am contacting you from the same number registered on my account${
          safeContext === undefined || safeContext.length === 0
            ? "."
            : `. Reference: ${safeContext}`
        }`
      : `مرحباً دعم إتقانك. أتواصل معكم من نفس الرقم المسجل في حسابي${
          safeContext === undefined || safeContext.length === 0 ? "." : `. المرجع: ${safeContext}`
        }`;
  const recipient = SUPPORT_WHATSAPP_E164.slice(1);
  return `https://wa.me/${recipient}?text=${encodeURIComponent(message)}`;
}
