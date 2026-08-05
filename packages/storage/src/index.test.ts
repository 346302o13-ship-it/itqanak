import { describe, expect, it } from "vitest";
import { assertAllowedUpload, createOpaqueObjectKey, StorageValidationError } from "./index.js";

describe("storage input policy", () => {
  it("creates opaque, non-user-derived object keys", () => {
    const first = createOpaqueObjectKey();
    const second = createOpaqueObjectKey();
    expect(first).toMatch(/^uploads\/[a-f0-9]{32}$/);
    expect(first).not.toEqual(second);
  });

  it("rejects a disallowed file type", () => {
    expect(() => assertAllowedUpload("unsafe.exe", "application/octet-stream", 1, 100)).toThrow(
      StorageValidationError,
    );
  });
});
