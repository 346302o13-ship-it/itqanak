import type { AppConfig } from "@itqanak/config";
import type { DatabaseClient } from "@itqanak/db";
import { describe, expect, it } from "vitest";

import { AuthService } from "./service.js";
import type { AuthenticatedPrincipal } from "./types.js";

const admin: AuthenticatedPrincipal = {
  userId: "00000000-0000-4000-8000-000000000001",
  sessionId: "00000000-0000-4000-8000-000000000002",
  roles: ["ADMIN"],
  permissions: ["admin.dashboard.view", "admin.passwordresets.read"],
  displayName: "Recovery administrator",
  status: "ACTIVE",
};

describe("phone password reset request lookup", () => {
  it("returns the expiry from the reset token linked to the approved request", async () => {
    const requestExpiresAt = new Date("2026-08-13T09:00:00.000Z");
    const resetTokenExpiresAt = new Date("2026-08-13T10:37:00.000Z");
    let query = "";
    const database = (async (strings: TemplateStringsArray) => {
      query = strings.join("?");
      return [
        {
          id: "00000000-0000-4000-8000-000000000003",
          user_id: "00000000-0000-4000-8000-000000000004",
          display_name: "Test student",
          phone_e164: "+971500000000",
          country_code: "AE",
          public_reference: "PR-0123456789",
          status: "APPROVED",
          requested_at: new Date("2026-08-13T07:00:00.000Z"),
          expires_at: requestExpiresAt,
          reset_token_expires_at: resetTokenExpiresAt.toISOString(),
          reviewed_at: new Date("2026-08-13T08:00:00.000Z"),
          reviewed_by_user_id: admin.userId,
          whatsapp_reference: "wa-test-reference",
          review_note: null,
          completed_at: null,
        },
      ];
    }) as unknown as DatabaseClient;
    const service = new AuthService({ database, config: {} as AppConfig });

    const result = await service.getPhonePasswordResetRequest(
      admin,
      "00000000-0000-4000-8000-000000000003",
    );

    expect(result.expiresAt).toEqual(requestExpiresAt);
    expect(result.resetTokenExpiresAt).toEqual(resetTokenExpiresAt);
    expect(query).toMatch(/LEFT JOIN password_reset_tokens AS reset_tokens/u);
    expect(query).toMatch(/reset_tokens\.expires_at AS reset_token_expires_at/u);
  });
});
