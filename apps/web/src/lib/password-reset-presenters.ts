import type { PhonePasswordResetRequest } from "@itqanak/auth";

type PasswordResetExpirySource = Pick<PhonePasswordResetRequest, "status" | "resetTokenExpiresAt">;

export function issuedPasswordResetExpiryIso(
  request: PasswordResetExpirySource,
): string | undefined {
  if (request.status !== "APPROVED" || request.resetTokenExpiresAt === undefined) {
    return undefined;
  }
  return request.resetTokenExpiresAt.toISOString();
}
