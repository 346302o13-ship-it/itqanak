import { describe, expect, it } from "vitest";

import { argon2idOptions, assertPasswordPolicy, hashPassword, verifyPassword } from "./password.js";

describe("password policy and hashing", () => {
  it("accepts a passphrase without silently changing it", () => {
    const password = "correct horse battery staple 2026";

    expect(assertPasswordPolicy(password)).toBe(password);
  });

  it("rejects too-short, too-long, and control-character passwords", () => {
    expect(() => assertPasswordPolicy("shorty1")).toThrow();
    expect(() => assertPasswordPolicy("a".repeat(129))).toThrow();
    expect(() => assertPasswordPolicy("valid passphrase\u0000value")).toThrow();
  });

  it("accepts an 8-character password with no complexity rules", () => {
    expect(assertPasswordPolicy("hunter22")).toBe("hunter22");
  });

  it("rejects an all-digit sequential run but allows digits mixed with letters", () => {
    expect(() => assertPasswordPolicy("12345678")).toThrow();
    expect(() => assertPasswordPolicy("87654321")).toThrow();
    expect(() => assertPasswordPolicy("00000000")).toThrow();
    expect(() => assertPasswordPolicy("1234567890")).toThrow();
    expect(assertPasswordPolicy("1234abcd")).toBe("1234abcd");
    expect(assertPasswordPolicy("90833271")).toBe("90833271");
  });

  it("uses the approved Argon2id work factors and verifies a correct password", async () => {
    const password = "correct horse battery staple 2026";
    const passwordHash = await hashPassword(password);

    expect(argon2idOptions.memoryCost).toBe(19 * 1024);
    expect(argon2idOptions.timeCost).toBe(2);
    expect(argon2idOptions.parallelism).toBe(1);
    expect(argon2idOptions.hashLength).toBe(32);
    expect(passwordHash).toMatch(/^\$argon2id\$/u);
    await expect(verifyPassword(passwordHash, password)).resolves.toBe(true);
    await expect(verifyPassword(passwordHash, "different passphrase 2026")).resolves.toBe(false);
  });

  it("fails closed for malformed stored hashes", async () => {
    await expect(
      verifyPassword("not-an-argon2-hash", "correct horse battery staple 2026"),
    ).resolves.toBe(false);
  });
});
