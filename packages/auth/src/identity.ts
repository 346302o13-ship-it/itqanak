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

export const phoneCountryCodes = ["SA", "AE", "KW"] as const;
export type PhoneCountryCode = (typeof phoneCountryCodes)[number];

const dialingCodeByCountry = {
  SA: "966",
  AE: "971",
  KW: "965",
} as const satisfies Readonly<Record<PhoneCountryCode, string>>;

const e164PatternByCountry = {
  SA: /^\+9665[0-9]{8}$/u,
  AE: /^\+9715[0-9]{8}$/u,
  KW: /^\+965[569][0-9]{7}$/u,
} as const satisfies Readonly<Record<PhoneCountryCode, RegExp>>;

function asciiDigits(value: string): string {
  const arabicIndic = "٠١٢٣٤٥٦٧٨٩";
  const easternArabicIndic = "۰۱۲۳۴۵۶۷۸۹";
  return [...value]
    .map((character) => {
      const arabicIndex = arabicIndic.indexOf(character);
      if (arabicIndex >= 0) {
        return String(arabicIndex);
      }
      const easternIndex = easternArabicIndic.indexOf(character);
      return easternIndex >= 0 ? String(easternIndex) : character;
    })
    .join("");
}

function compactPhone(value: string): string {
  const normalized = asciiDigits(value.trim()).replace(/[\s().-]/gu, "");
  if (normalized.startsWith("00")) {
    return `+${normalized.slice(2)}`;
  }
  return normalized;
}

function countryForInternationalPhone(value: string): PhoneCountryCode | undefined {
  return phoneCountryCodes.find((country) => value.startsWith(`+${dialingCodeByCountry[country]}`));
}

/**
 * Normalizes mobile numbers from Saudi Arabia, the UAE, and Kuwait to E.164.
 * A country is mandatory for local/national input. International input may be
 * normalized without a country, which is useful for the single login field.
 */
export function normalizePhone(
  value: string,
  expectedCountry?: PhoneCountryCode,
): { readonly e164: string; readonly countryCode: PhoneCountryCode } {
  let compact = compactPhone(value);
  if (compact.length === 0) {
    throw new Error("PHONE_REQUIRED");
  }

  let countryCode = expectedCountry ?? countryForInternationalPhone(compact);
  if (compact.startsWith("+")) {
    const inferred = countryForInternationalPhone(compact);
    if (inferred === undefined || (expectedCountry !== undefined && inferred !== expectedCountry)) {
      throw new Error("PHONE_COUNTRY_MISMATCH");
    }
    countryCode = inferred;
  } else {
    if (countryCode === undefined) {
      throw new Error("PHONE_COUNTRY_REQUIRED");
    }
    const dialingCode = dialingCodeByCountry[countryCode];
    if (compact.startsWith(dialingCode)) {
      compact = `+${compact}`;
    } else {
      if ((countryCode === "SA" || countryCode === "AE") && compact.startsWith("0")) {
        compact = compact.slice(1);
      }
      compact = `+${dialingCode}${compact}`;
    }
  }

  if (countryCode === undefined || !e164PatternByCountry[countryCode].test(compact)) {
    throw new Error("PHONE_INVALID");
  }
  return { e164: compact, countryCode };
}

export function isPhoneCountryCode(value: string): value is PhoneCountryCode {
  return (phoneCountryCodes as readonly string[]).includes(value);
}

export function maskPhoneForDisplay(value: string): string {
  const country = countryForInternationalPhone(value);
  if (country === undefined || !e164PatternByCountry[country].test(value)) {
    return "[masked]";
  }
  const prefix = `+${dialingCodeByCountry[country]}`;
  const hiddenLength = value.length - prefix.length - 4;
  return `${prefix}${"•".repeat(hiddenLength)}${value.slice(-4)}`;
}

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
