import { NextRequest, type NextResponse } from "next/server";
import { getRedirectUrl, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { config, proxy } from "./proxy";

const originalEnvironment = {
  ADMIN_APP_URL: process.env.ADMIN_APP_URL,
  CLOUDFLARE_ACCESS_MODE: process.env.CLOUDFLARE_ACCESS_MODE,
  PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
};

describe("application proxy boundary", () => {
  beforeEach(() => {
    process.env.ADMIN_APP_URL = "https://admin.example.test";
    process.env.PUBLIC_APP_URL = "https://app.example.test";
    process.env.CLOUDFLARE_ACCESS_MODE = "disabled";
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(originalEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("covers localized pages, root, and application APIs while excluding static assets", () => {
    expect(unstable_doesMiddlewareMatch({ config, url: "/" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/ar/student" })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: "/api/student/support/messages" })).toBe(
      true,
    );
    expect(unstable_doesMiddlewareMatch({ config, url: "/icon.png" })).toBe(false);
  });

  it("does not expose administrative APIs on the public hostname", async () => {
    const response = await proxy(
      new NextRequest("https://app.example.test/api/admin/students", {
        headers: { host: "app.example.test" },
      }),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("opens the administrator hostname at the localized admin dashboard", async () => {
    const response = await proxy(
      new NextRequest("https://admin.example.test/", {
        headers: { host: "admin.example.test" },
      }),
    );
    expect(response.status).toBe(307);
    expect(getRedirectUrl(response as NextResponse)).toBe("https://admin.example.test/ar/admin");
  });
});
