import argon2 from "argon2";
import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(12, "PASSWORD_TOO_SHORT")
  .max(128, "PASSWORD_TOO_LONG")
  .refine((value) => !value.includes("\u0000"), "PASSWORD_INVALID");

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
