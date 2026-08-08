import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface AuthEmailPayload {
  readonly kind: "VERIFY_EMAIL" | "PASSWORD_RESET" | "PASSWORD_CHANGED";
  readonly recipientEmail: string;
  readonly displayName: string;
  readonly token?: string;
  readonly expiresAt?: string;
}

export class AuthEmailPayloadError extends Error {
  public constructor() {
    super("Authentication email payload could not be processed.");
    this.name = "AuthEmailPayloadError";
  }
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new AuthEmailPayloadError();
  }
  return key;
}

/** AES-256-GCM output is version.iv.ciphertext.tag, all base64url encoded. */
export function encryptAuthEmailPayload(payload: AuthEmailPayload, keyMaterial: string): string {
  const key = decodeKey(keyMaterial);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(".");
}

export function decryptAuthEmailPayload(value: string, keyMaterial: string): AuthEmailPayload {
  const [version, ivEncoded, ciphertextEncoded, tagEncoded, extra] = value.split(".");
  if (
    version !== "v1" ||
    ivEncoded === undefined ||
    ciphertextEncoded === undefined ||
    tagEncoded === undefined ||
    extra !== undefined
  ) {
    throw new AuthEmailPayloadError();
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      decodeKey(keyMaterial),
      Buffer.from(ivEncoded, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]);
    const parsed: unknown = JSON.parse(plaintext.toString("utf8"));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      !["VERIFY_EMAIL", "PASSWORD_RESET", "PASSWORD_CHANGED"].includes(
        (parsed as { kind?: unknown }).kind as string,
      ) ||
      typeof (parsed as { recipientEmail?: unknown }).recipientEmail !== "string" ||
      typeof (parsed as { displayName?: unknown }).displayName !== "string"
    ) {
      throw new AuthEmailPayloadError();
    }
    const token = (parsed as { token?: unknown }).token;
    const expiresAt = (parsed as { expiresAt?: unknown }).expiresAt;
    if (
      (token !== undefined && typeof token !== "string") ||
      (expiresAt !== undefined && typeof expiresAt !== "string")
    ) {
      throw new AuthEmailPayloadError();
    }
    return {
      kind: (parsed as AuthEmailPayload).kind,
      recipientEmail: (parsed as AuthEmailPayload).recipientEmail,
      displayName: (parsed as AuthEmailPayload).displayName,
      ...(typeof token === "string" ? { token } : {}),
      ...(typeof expiresAt === "string" ? { expiresAt } : {}),
    };
  } catch (error: unknown) {
    if (error instanceof AuthEmailPayloadError) {
      throw error;
    }
    throw new AuthEmailPayloadError();
  }
}
