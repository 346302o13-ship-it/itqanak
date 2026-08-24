import { describe, expect, it } from "vitest";

import { SUPPORT_WHATSAPP_E164, supportWhatsAppHref } from "./support-contact";

describe("support WhatsApp contact", () => {
  it("uses the Saudi support number without exposing a leading plus in wa.me", () => {
    expect(SUPPORT_WHATSAPP_E164).toBe("+966564202263");
    const url = new URL(supportWhatsAppHref("ar", "ITQ-2026-000001"));
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/966564202263");
    expect(url.searchParams.get("text")).toContain("ITQ-2026-000001");
  });

  it("provides localized, bounded prefilled text", () => {
    const url = new URL(supportWhatsAppHref("en", `line\n${"x".repeat(300)}`));
    expect(url.searchParams.get("text")).toContain("same number registered");
    expect(url.searchParams.get("text")).not.toContain("\n");
    expect(url.searchParams.get("text")?.length).toBeLessThan(300);
  });
});
