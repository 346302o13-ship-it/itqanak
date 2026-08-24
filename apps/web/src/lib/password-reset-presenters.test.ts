import { describe, expect, it } from "vitest";

import { issuedPasswordResetExpiryIso } from "./password-reset-presenters";

describe("issued password reset presentation", () => {
  it("uses the persisted reset-token expiry without recomputing it", () => {
    const persistedExpiry = new Date("2026-08-13T10:37:00.000Z");

    expect(
      issuedPasswordResetExpiryIso({
        status: "APPROVED",
        resetTokenExpiresAt: persistedExpiry,
      }),
    ).toBe("2026-08-13T10:37:00.000Z");
  });

  it("does not present an issued link without an approved linked token", () => {
    expect(issuedPasswordResetExpiryIso({ status: "APPROVED" })).toBeUndefined();
    expect(
      issuedPasswordResetExpiryIso({
        status: "LINK_EXPIRED",
        resetTokenExpiresAt: new Date("2026-08-13T10:37:00.000Z"),
      }),
    ).toBeUndefined();
  });
});
