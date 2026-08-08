import { describe, expect, it } from "vitest";

import { serializeAuditMetadata } from "./audit.js";

describe("authentication audit metadata", () => {
  it("redacts credentials, tokens, cookies, and personal identifiers", () => {
    const serialized = serializeAuditMetadata({
      password: "do-not-store-this-password",
      resetToken: "do-not-store-this-token",
      email: "student@example.test",
      cookie: "itqanak_session=do-not-store-this-session",
      reason_code: "INVALID_CREDENTIALS",
    });

    expect(serialized).toContain("INVALID_CREDENTIALS");
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("do-not-store");
    expect(serialized).not.toContain("student@example.test");
  });
});
