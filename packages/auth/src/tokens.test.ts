import { describe, expect, it } from "vitest";

import { generateOpaqueToken, hashValidator, parseOpaqueToken, validatorsMatch } from "./tokens.js";

describe("opaque authentication tokens", () => {
  it("creates a selector and validator while retaining only the validator hash", () => {
    const token = generateOpaqueToken();

    expect(token.selector).toMatch(/^[a-f0-9]{32}$/u);
    expect(token.validator).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(token.raw).toBe(`${token.selector}.${token.validator}`);
    expect(token.validatorHash).toBe(hashValidator(token.validator));
    expect(token.raw).not.toContain(token.validatorHash);
    expect(parseOpaqueToken(token.raw)).toEqual({
      selector: token.selector,
      validator: token.validator,
    });
    expect(validatorsMatch(token.validatorHash, token.validator)).toBe(true);
  });

  it("rejects malformed and over-segmented raw tokens", () => {
    for (const value of [
      "",
      "selector-only",
      "too-short.value",
      `${"a".repeat(32)}.${"a".repeat(43)}.extra`,
      `${"A".repeat(32)}.${"a".repeat(43)}`,
      `${"a".repeat(32)}.${"+".repeat(43)}`,
    ]) {
      expect(parseOpaqueToken(value)).toBeUndefined();
    }
  });

  it("uses a constant-time comparison path and denies invalid stored material", () => {
    const token = generateOpaqueToken();

    expect(validatorsMatch(token.validatorHash, `${token.validator}x`)).toBe(false);
    expect(validatorsMatch("not-a-sha256-hash", token.validator)).toBe(false);
    expect(validatorsMatch("a".repeat(63), token.validator)).toBe(false);
  });
});
