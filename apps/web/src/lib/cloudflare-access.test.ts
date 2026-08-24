import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import {
  CloudflareAccessError,
  cloudflareIdentityMatchesAdmin,
  cloudflareAccessSettings,
  verifyCloudflareAccessToken,
} from "./cloudflare-access";

const enabledSettings = {
  mode: "enabled" as const,
  teamDomain: "https://itqanak.cloudflareaccess.com",
  audience: "itqanak-admin-audience",
  adminEmail: "owner@example.com",
};

async function signedToken(input: {
  readonly email?: string;
  readonly audience?: string;
  readonly issuer?: string;
}) {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  const verificationKey = await importJWK({ ...publicJwk, alg: "RS256" }, "RS256");
  const token = await new SignJWT({
    email: input.email ?? enabledSettings.adminEmail,
    type: "app",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(input.issuer ?? enabledSettings.teamDomain)
    .setAudience(input.audience ?? enabledSettings.audience)
    .setSubject("cloudflare-user-id")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
  return { token, verificationKey };
}

describe("Cloudflare Access", () => {
  it("is explicitly disabled by default", () => {
    expect(cloudflareAccessSettings({})).toEqual({ mode: "disabled" });
  });

  it("rejects incomplete or unsafe enabled configuration", () => {
    expect(() => cloudflareAccessSettings({ CLOUDFLARE_ACCESS_MODE: "enabled" })).toThrow(
      CloudflareAccessError,
    );
    expect(() =>
      cloudflareAccessSettings({
        CLOUDFLARE_ACCESS_MODE: "enabled",
        CLOUDFLARE_ACCESS_TEAM_DOMAIN: "https://attacker.example",
        CLOUDFLARE_ACCESS_AUDIENCE: "audience",
        CLOUDFLARE_ACCESS_ADMIN_EMAIL: "owner@example.com",
      }),
    ).toThrow(CloudflareAccessError);
  });

  it("accepts only a signed token for the configured audience and owner email", async () => {
    const { token, verificationKey } = await signedToken({});
    await expect(
      verifyCloudflareAccessToken(token, enabledSettings, async () => verificationKey),
    ).resolves.toEqual({
      email: "owner@example.com",
      subject: "cloudflare-user-id",
    });

    const wrongEmail = await signedToken({ email: "someone-else@example.com" });
    await expect(
      verifyCloudflareAccessToken(
        wrongEmail.token,
        enabledSettings,
        async () => wrongEmail.verificationKey,
      ),
    ).rejects.toMatchObject({ code: "IDENTITY_DENIED" });

    const wrongAudience = await signedToken({ audience: "another-app" });
    await expect(
      verifyCloudflareAccessToken(
        wrongAudience.token,
        enabledSettings,
        async () => wrongAudience.verificationKey,
      ),
    ).rejects.toMatchObject({ code: "TOKEN_INVALID" });
  });

  it("fails closed when the Access token is missing", async () => {
    await expect(verifyCloudflareAccessToken(undefined, enabledSettings)).rejects.toMatchObject({
      code: "TOKEN_MISSING",
    });
  });

  it("binds the signed Access identity to the single in-application administrator", () => {
    const identity = { email: "owner@example.com", subject: "cloudflare-user-id" };
    expect(
      cloudflareIdentityMatchesAdmin(identity, {
        email: "OWNER@example.com",
        roles: ["ADMIN"],
      }),
    ).toBe(true);
    expect(
      cloudflareIdentityMatchesAdmin(identity, {
        email: "other@example.com",
        roles: ["ADMIN"],
      }),
    ).toBe(false);
    expect(
      cloudflareIdentityMatchesAdmin(identity, {
        email: "owner@example.com",
        roles: ["STUDENT"],
      }),
    ).toBe(false);
  });
});
