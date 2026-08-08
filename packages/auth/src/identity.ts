import { z } from "zod";

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, "DISPLAY_NAME_TOO_SHORT")
  .max(120, "DISPLAY_NAME_TOO_LONG")
  .refine((value) => !containsControlCharacter(value), "DISPLAY_NAME_INVALID");

const emailSchema = z.string().trim().min(3).max(320).email();

/**
 * The original address is retained for display and delivery. The normalized key
 * deliberately folds case for the entire address, without plus-address or dot
 * rewriting, so the platform cannot create duplicate accounts by case alone.
 * This product identity rule is narrower and safer than provider-specific
 * guesses about aliases.
 */
export function normalizeEmail(value: string): string {
  const parsed = emailSchema.parse(value);
  return parsed.toLocaleLowerCase("en-US");
}

export function normalizeDisplayName(value: string): string {
  return displayNameSchema.parse(value);
}

export function maskEmailForDisplay(value: string): string {
  const [localPart, domain] = value.split("@");
  if (localPart === undefined || domain === undefined || localPart.length === 0) {
    return "[masked]";
  }
  return `${localPart.slice(0, 1)}***@${domain}`;
}
