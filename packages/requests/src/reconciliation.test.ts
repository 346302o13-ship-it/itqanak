import { Readable } from "node:stream";

import type { ObjectStorage } from "@itqanak/storage";
import { describe, expect, it, vi } from "vitest";

import { boundedReconciliationLimit, removeReferencedObjectIfPresent } from "./reconciliation.js";

function storageWith(remove: ObjectStorage["remove"]): ObjectStorage {
  return {
    provider: "local",
    exists: async () => true,
    remove,
    put: async (key) => ({ key, checksumSha256: "a".repeat(64), contentLength: 1 }),
    open: async () => Readable.from(["x"]),
    signDownload: async () => "https://invalid.test/private",
  };
}

describe("attachment storage reconciliation", () => {
  it("keeps every execution batch bounded", () => {
    expect(boundedReconciliationLimit(-10)).toBe(1);
    expect(boundedReconciliationLimit(7.9)).toBe(7);
    expect(boundedReconciliationLimit(10_000)).toBe(20);
    expect(boundedReconciliationLimit(Number.NaN)).toBe(1);
  });

  it("treats a local already-absent object as an idempotent delete", async () => {
    const missing = Object.assign(new Error("object is absent"), { code: "ENOENT" });
    const remove = vi.fn<ObjectStorage["remove"]>().mockRejectedValueOnce(missing);
    const storage = storageWith(remove);

    await expect(removeReferencedObjectIfPresent(storage, "requests/ref/object")).resolves.toBe(
      undefined,
    );
    expect(remove).toHaveBeenCalledOnce();
  });

  it("deletes the referenced key exactly once", async () => {
    const remove = vi.fn<ObjectStorage["remove"]>().mockResolvedValueOnce(undefined);
    const storage = storageWith(remove);

    await expect(removeReferencedObjectIfPresent(storage, "requests/ref/object")).resolves.toBe(
      undefined,
    );
    expect(remove).toHaveBeenCalledOnce();
  });

  it("preserves a real storage failure for a later retry", async () => {
    const remove = vi
      .fn<ObjectStorage["remove"]>()
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const storage = storageWith(remove);

    await expect(removeReferencedObjectIfPresent(storage, "requests/ref/object")).rejects.toThrow(
      "storage unavailable",
    );
  });
});
