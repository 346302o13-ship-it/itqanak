import { describe, expect, it } from "vitest";

import { installInstructionKind, isStandaloneApp } from "./pwa-install";
import {
  isAdminManifestHost,
  normalizeManifestHostname,
  webAppManifestForContext,
  webAppManifestForHost,
  webAppManifestHref,
} from "./pwa-manifest";

describe("install app helpers", () => {
  it("recognizes both standard display mode and the iOS standalone flag", () => {
    expect(isStandaloneApp(true, false)).toBe(true);
    expect(isStandaloneApp(false, true)).toBe(true);
    expect(isStandaloneApp(false, "true")).toBe(false);
  });

  it("uses iOS instructions for iPhone and iPad desktop user agents", () => {
    expect(
      installInstructionKind({
        maxTouchPoints: 0,
        platform: "iPhone",
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      }),
    ).toBe("ios");
    expect(
      installInstructionKind({
        maxTouchPoints: 5,
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
      }),
    ).toBe("ios");
  });

  it("keeps desktop and Android browsers on the generic instructions", () => {
    expect(
      installInstructionKind({
        maxTouchPoints: 0,
        platform: "Linux x86_64",
        userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
      }),
    ).toBe("browser");
    expect(
      installInstructionKind({
        maxTouchPoints: 5,
        platform: "Linux armv8l",
        userAgent: "Mozilla/5.0 (Linux; Android 15)",
      }),
    ).toBe("browser");
  });
});

describe("web app manifest helpers", () => {
  it("normalizes case, ports, proxy lists, trailing dots, and IPv6 hosts", () => {
    expect(normalizeManifestHostname(" ADMIN.ItqanqHelpStudent.Online:443 ")).toBe(
      "admin.itqanqhelpstudent.online",
    );
    expect(normalizeManifestHostname("itqanqhelpstudent.online., proxy.internal")).toBe(
      "itqanqhelpstudent.online",
    );
    expect(normalizeManifestHostname("[::1]:3000")).toBe("::1");
  });

  it("selects the admin manifest only for an admin hostname", () => {
    expect(isAdminManifestHost("admin.itqanqhelpstudent.online")).toBe(true);
    expect(isAdminManifestHost("admin.localhost:3000")).toBe(true);
    expect(isAdminManifestHost("itqanqhelpstudent.online")).toBe(false);
    expect(isAdminManifestHost(undefined)).toBe(false);
  });

  it("builds stable public and admin installation identities", () => {
    const publicManifest = webAppManifestForHost("itqanqhelpstudent.online");
    const adminManifest = webAppManifestForHost("admin.itqanqhelpstudent.online");
    expect(publicManifest).toMatchObject({
      display: "standalone",
      name: "إتقانك",
      scope: "/",
      start_url: "/ar",
    });
    expect(adminManifest).toMatchObject({
      display: "standalone",
      name: "إتقانك | مركز الإدارة",
      scope: "/",
      start_url: "/ar/admin",
    });
    expect(publicManifest.icons).toHaveLength(3);
    expect(adminManifest.icons).toEqual(publicManifest.icons);
  });

  it("keeps locale and destination aligned with the surface where installation starts", () => {
    expect(webAppManifestHref("en", "student")).toBe(
      "/manifest.webmanifest?locale=en&surface=student",
    );
    expect(webAppManifestForContext("itqanqhelpstudent.online", "en", "student")).toMatchObject({
      dir: "ltr",
      lang: "en",
      start_url: "/en/student",
    });
    expect(
      webAppManifestForContext("admin.itqanqhelpstudent.online", "en", "public"),
    ).toMatchObject({ start_url: "/en/admin" });
    expect(webAppManifestForContext("itqanqhelpstudent.online", "ar", "public").icons).toEqual(
      expect.arrayContaining([expect.objectContaining({ sizes: "192x192" })]),
    );
  });
});
