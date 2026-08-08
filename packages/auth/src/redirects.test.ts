import { describe, expect, it } from "vitest";

import { safeInternalPath } from "./redirects.js";

describe("safeInternalPath", () => {
  it("retains a same-origin internal path, query, and fragment", () => {
    expect(safeInternalPath("/ar/account/sessions?status=updated#current")).toBe(
      "/ar/account/sessions?status=updated#current",
    );
  });

  it("uses the fallback for external, protocol-relative, and malformed redirect values", () => {
    const fallback = "/ar/auth/login";

    for (const value of [
      "https://attacker.example.test/ar/account",
      "//attacker.example.test/ar/account",
      "/\\attacker.example.test",
      "ar/account",
      "",
      undefined,
    ]) {
      expect(safeInternalPath(value, fallback)).toBe(fallback);
    }
  });
});
