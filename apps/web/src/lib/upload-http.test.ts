import { describe, expect, it } from "vitest";

import { RequestDomainError } from "@itqanak/requests";

import { requestErrorStatus } from "./request-http";
import {
  assertUploadBytesComplete,
  assertUploadBytesNotExceeded,
  createUploadDeadline,
  parseUploadContentLength,
  readWithUploadDeadline,
} from "./upload-http";

describe("raw upload HTTP framing", () => {
  it("classifies a missing or malformed length as a 400 invalid request", () => {
    for (const value of [null, "", "0", "1e3", "12.5", "not-a-number"] as const) {
      try {
        parseUploadContentLength(value, 20);
        throw new Error("Expected content length parsing to fail.");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RequestDomainError);
        expect((error as RequestDomainError).code).toBe("INVALID_REQUEST");
        expect(requestErrorStatus(error)).toBe(400);
      }
    }
  });

  it("classifies an early oversized request as FILE_TOO_LARGE/422", () => {
    try {
      parseUploadContentLength("21", 20);
      throw new Error("Expected oversized content length to fail.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(RequestDomainError);
      expect((error as RequestDomainError).code).toBe("FILE_TOO_LARGE");
      expect(requestErrorStatus(error)).toBe(422);
    }
    expect(parseUploadContentLength("20", 20)).toBe(20);
  });

  it("classifies shorter and longer streams as malformed bodies", () => {
    for (const operation of [
      () => assertUploadBytesComplete(9, 10),
      () => assertUploadBytesNotExceeded(11, 10),
    ]) {
      try {
        operation();
        throw new Error("Expected byte framing to fail.");
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(RequestDomainError);
        expect(requestErrorStatus(error)).toBe(400);
      }
    }
  });

  it("enforces an absolute body-read deadline and supports explicit cleanup", async () => {
    const deadline = createUploadDeadline(60_000);
    const pendingRead = readWithUploadDeadline(
      () => new Promise<never>(() => undefined),
      deadline.signal,
    );
    deadline.signal.dispatchEvent(new Event("abort"));
    await expect(pendingRead).rejects.toMatchObject({ code: "UPLOAD_TIMEOUT" });
    deadline.close();
    deadline.close();
  });
});
