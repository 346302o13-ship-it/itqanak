/**
 * Guards the conversation-list preview shown while scanning many
 * conversations at once — deliberately NOT applied to the opened
 * conversation itself, where the assigned admin needs the real text to
 * actually handle the situation. Conservative and small on purpose: only
 * unambiguous severe profanity/harassment terms, so a legitimate message
 * (a complaint, a typo, an unrelated word that merely contains a
 * substring) is never mistaken for abuse. False negatives here are far
 * cheaper than false positives — this hides a preview, nothing else.
 */
const SEVERE_TERMS: readonly RegExp[] = [
  /كسم/u,
  /كس[\s]*ام/u,
  /ابن\s*ال(كلب|قحبه|قحبة)/u,
  /يلعن\s*دين/u,
  /عرص/u,
  /خول/u,
  /قحبه|قحبة/u,
  /شرموط/u,
  /متناك/u,
  /زبي/u,
  /نيك[\s]*(امك|اختك|ابوك)/u,
  /\bfuck\s*you\b/iu,
  /\bfuck\s*off\b/iu,
  /\bcunt\b/iu,
  /\bmotherfucker\b/iu,
  /🖕/u,
];

const FLAGGED_PREVIEW_PLACEHOLDER = "⚠️ رسالة تحتوي على لغة غير لائقة";

export function containsSevereAbuse(text: string): boolean {
  return SEVERE_TERMS.some((pattern) => pattern.test(text));
}

/** Returns the preview unchanged, or a neutral placeholder if it matches the
 *  severe-terms list — the placeholder never appears in the opened
 *  conversation, only in list/preview surfaces. */
export function moderateMessagePreview(text: string): string {
  return containsSevereAbuse(text) ? FLAGGED_PREVIEW_PLACEHOLDER : text;
}
