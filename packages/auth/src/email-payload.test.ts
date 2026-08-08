import { describe, expect, it } from "vitest";

import {
  AuthEmailPayloadError,
  decryptAuthEmailPayload,
  encryptAuthEmailPayload,
} from "./email-payload.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
const anotherEncryptionKey = Buffer.alloc(32, 8).toString("base64");

describe("encrypted authentication-email payloads", () => {
  it("round-trips a verification payload without exposing the raw token in ciphertext", () => {
    const payload = {
      kind: "VERIFY_EMAIL" as const,
      recipientEmail: "student@example.test",
      displayName: "طالب اختبار",
      token: "example-selector.example-validator",
      expiresAt: "2026-08-06T00:00:00.000Z",
    };
    const encrypted = encryptAuthEmailPayload(payload, encryptionKey);

    expect(encrypted).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
    expect(encrypted).not.toContain(payload.token);
    expect(decryptAuthEmailPayload(encrypted, encryptionKey)).toEqual(payload);
  });

  it("rejects tampered ciphertext and a different encryption key", () => {
    const encrypted = encryptAuthEmailPayload(
      {
        kind: "PASSWORD_RESET",
        recipientEmail: "student@example.test",
        displayName: "طالب اختبار",
        token: "example-selector.example-validator",
      },
      encryptionKey,
    );
    const parts = encrypted.split(".");
    const tag = Buffer.from(parts[3] ?? "", "base64url");
    tag[0] = (tag[0] ?? 0) ^ 1;
    parts[3] = tag.toString("base64url");
    const tampered = parts.join(".");

    expect(() => decryptAuthEmailPayload(tampered, encryptionKey)).toThrow(AuthEmailPayloadError);
    expect(() => decryptAuthEmailPayload(encrypted, anotherEncryptionKey)).toThrow(
      AuthEmailPayloadError,
    );
  });

  it("rejects invalid payload shapes and key material", () => {
    const invalidPayload = encryptAuthEmailPayload(
      {
        kind: "UNTRUSTED",
        recipientEmail: "student@example.test",
        displayName: "طالب اختبار",
      } as unknown as Parameters<typeof encryptAuthEmailPayload>[0],
      encryptionKey,
    );

    expect(() => decryptAuthEmailPayload(invalidPayload, encryptionKey)).toThrow(
      AuthEmailPayloadError,
    );
    expect(() =>
      encryptAuthEmailPayload(
        {
          kind: "PASSWORD_CHANGED",
          recipientEmail: "student@example.test",
          displayName: "طالب اختبار",
        },
        "invalid-key-material",
      ),
    ).toThrow(AuthEmailPayloadError);
  });
});
