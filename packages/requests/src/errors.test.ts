import { describe, expect, it } from "vitest";

import { RequestDomainError, requestErrorCodes } from "./errors.js";

describe("request domain errors", () => {
  it("exposes stable value-free error codes", () => {
    const error = new RequestDomainError("VERSION_CONFLICT");
    expect(error.name).toBe("RequestDomainError");
    expect(error.message).toBe("VERSION_CONFLICT");
    expect(requestErrorCodes).toContain(error.code);
  });
});
