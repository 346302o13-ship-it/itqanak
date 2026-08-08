import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { type GeneratedOpaqueToken } from "./types.js";

const selectorPattern = /^[a-f0-9]{32}$/;
const validatorPattern = /^[A-Za-z0-9_-]{43}$/;
const hashPattern = /^[a-f0-9]{64}$/;

export function hashValidator(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function generateOpaqueToken(): GeneratedOpaqueToken {
  const selector = randomBytes(16).toString("hex");
  const validator = randomBytes(32).toString("base64url");
  return {
    selector,
    validator,
    raw: `${selector}.${validator}`,
    validatorHash: hashValidator(validator),
  };
}

export function parseOpaqueToken(
  value: string,
): { readonly selector: string; readonly validator: string } | undefined {
  const [selector, validator, extra] = value.split(".");
  if (
    selector === undefined ||
    validator === undefined ||
    extra !== undefined ||
    !selectorPattern.test(selector) ||
    !validatorPattern.test(validator)
  ) {
    return undefined;
  }
  return { selector, validator };
}

export function validatorsMatch(storedHash: string, validator: string): boolean {
  if (!hashPattern.test(storedHash)) {
    return false;
  }
  const expected = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(hashValidator(validator), "hex");
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}
