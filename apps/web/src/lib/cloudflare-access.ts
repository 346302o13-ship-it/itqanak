import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";

export const cloudflareAccessModes = ["disabled", "enabled"] as const;
export type CloudflareAccessMode = (typeof cloudflareAccessModes)[number];

export interface CloudflareAccessSettingsDisabled {
  readonly mode: "disabled";
}

export interface CloudflareAccessSettingsEnabled {
  readonly mode: "enabled";
  readonly teamDomain: string;
  readonly audience: string;
  readonly adminEmail: string;
}

export type CloudflareAccessSettings =
  | CloudflareAccessSettingsDisabled
  | CloudflareAccessSettingsEnabled;

export interface CloudflareAccessIdentity {
  readonly email: string;
  readonly subject: string;
}

interface CloudflareBoundAdminPrincipal {
  readonly email?: string;
  readonly roles: readonly string[];
}

export function cloudflareIdentityMatchesAdmin(
  identity: CloudflareAccessIdentity | undefined,
  principal: CloudflareBoundAdminPrincipal,
): boolean {
  return (
    identity === undefined ||
    (principal.roles.includes("ADMIN") && principal.email?.trim().toLowerCase() === identity.email)
  );
}

export class CloudflareAccessError extends Error {
  public constructor(
    public readonly code:
      | "CONFIGURATION_INVALID"
      | "TOKEN_MISSING"
      | "TOKEN_INVALID"
      | "IDENTITY_DENIED",
  ) {
    super("Cloudflare Access authorization failed.");
    this.name = "CloudflareAccessError";
  }
}

type CloudflareAccessEnvironment = Readonly<Record<string, string | undefined>>;

const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function requiredValue(environment: CloudflareAccessEnvironment, name: string): string {
  const value = environment[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new CloudflareAccessError("CONFIGURATION_INVALID");
  }
  return value;
}

function normalizedTeamDomain(value: string): string {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      !url.hostname.toLowerCase().endsWith(".cloudflareaccess.com")
    ) {
      throw new CloudflareAccessError("CONFIGURATION_INVALID");
    }
    return url.origin;
  } catch (error: unknown) {
    if (error instanceof CloudflareAccessError) throw error;
    throw new CloudflareAccessError("CONFIGURATION_INVALID");
  }
}

function normalizedEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    throw new CloudflareAccessError("CONFIGURATION_INVALID");
  }
  return normalized;
}

export function cloudflareAccessSettings(
  environment: CloudflareAccessEnvironment = process.env,
): CloudflareAccessSettings {
  const rawMode = (environment.CLOUDFLARE_ACCESS_MODE ?? "disabled").trim();
  if (!cloudflareAccessModes.includes(rawMode as CloudflareAccessMode)) {
    throw new CloudflareAccessError("CONFIGURATION_INVALID");
  }
  if (rawMode === "disabled") return { mode: "disabled" };

  const audience = requiredValue(environment, "CLOUDFLARE_ACCESS_AUDIENCE");
  if (audience.length > 512 || /\s/u.test(audience)) {
    throw new CloudflareAccessError("CONFIGURATION_INVALID");
  }
  return {
    mode: "enabled",
    teamDomain: normalizedTeamDomain(requiredValue(environment, "CLOUDFLARE_ACCESS_TEAM_DOMAIN")),
    audience,
    adminEmail: normalizedEmail(requiredValue(environment, "CLOUDFLARE_ACCESS_ADMIN_EMAIL")),
  };
}

function keySetFor(settings: CloudflareAccessSettingsEnabled): JWTVerifyGetKey {
  const existing = remoteKeySets.get(settings.teamDomain);
  if (existing !== undefined) return existing;
  const keySet = createRemoteJWKSet(new URL(`${settings.teamDomain}/cdn-cgi/access/certs`), {
    cooldownDuration: 30_000,
    cacheMaxAge: 10 * 60_000,
    timeoutDuration: 5_000,
  });
  remoteKeySets.set(settings.teamDomain, keySet);
  return keySet;
}

function identityFromPayload(
  payload: JWTPayload,
  settings: CloudflareAccessSettingsEnabled,
): CloudflareAccessIdentity {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  if (email === "" || email !== settings.adminEmail) {
    throw new CloudflareAccessError("IDENTITY_DENIED");
  }
  if (payload.type !== "app" || typeof payload.sub !== "string" || payload.sub === "") {
    throw new CloudflareAccessError("TOKEN_INVALID");
  }
  return { email, subject: payload.sub };
}

export async function verifyCloudflareAccessToken(
  token: string | null | undefined,
  settings: CloudflareAccessSettings,
  keySet?: JWTVerifyGetKey,
): Promise<CloudflareAccessIdentity | undefined> {
  if (settings.mode === "disabled") return undefined;
  if (token === null || token === undefined || token.trim() === "") {
    throw new CloudflareAccessError("TOKEN_MISSING");
  }
  try {
    const { payload } = await jwtVerify(token, keySet ?? keySetFor(settings), {
      issuer: settings.teamDomain,
      audience: settings.audience,
      algorithms: ["RS256"],
      clockTolerance: 5,
    });
    return identityFromPayload(payload, settings);
  } catch (error: unknown) {
    if (error instanceof CloudflareAccessError) throw error;
    throw new CloudflareAccessError("TOKEN_INVALID");
  }
}

export async function verifyCloudflareAccessRequest(
  requestHeaders: Pick<Headers, "get">,
  environment: CloudflareAccessEnvironment = process.env,
): Promise<CloudflareAccessIdentity | undefined> {
  return verifyCloudflareAccessToken(
    requestHeaders.get("cf-access-jwt-assertion"),
    cloudflareAccessSettings(environment),
  );
}
