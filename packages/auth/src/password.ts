import argon2 from "argon2";
import { z } from "zod";

/**
 * Deliberately light policy: length only, no character-class rules. The one
 * extra guard rejects a password that is nothing but a straight run of digits
 * (e.g. "12345678", "999999", "87654321") — an all-numeric keypad sequence is
 * the one weak shape worth blocking outright. Wrap-around (…890, 098…) counts.
 */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export function isSequentialDigitRun(value: string): boolean {
  if (!/^\d+$/u.test(value)) return false;
  const digits = [...value].map((character) => character.charCodeAt(0) - 48);
  const allSame = digits.every((digit) => digit === digits[0]);
  const ascending = digits.every(
    (digit, index) => index === 0 || (digit - digits[index - 1]! + 10) % 10 === 1,
  );
  const descending = digits.every(
    (digit, index) => index === 0 || (digits[index - 1]! - digit + 10) % 10 === 1,
  );
  return allSame || ascending || descending;
}

export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, "PASSWORD_TOO_SHORT")
  .max(MAX_PASSWORD_LENGTH, "PASSWORD_TOO_LONG")
  .refine(
    (value) => ![...value].some((character) => character.charCodeAt(0) < 0x20),
    "PASSWORD_INVALID",
  )
  .refine((value) => !isSequentialDigitRun(value), "PASSWORD_SEQUENTIAL");

/** Benchmarked for the 4 GB deployment target; rate limiting protects this cost. */
export const argon2idOptions = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

export function assertPasswordPolicy(password: string): string {
  return passwordSchema.parse(password);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(assertPasswordPolicy(password), argon2idOptions);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    return false;
  }
}
