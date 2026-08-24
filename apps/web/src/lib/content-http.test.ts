import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AuthorizationError } from "@itqanak/auth";
import { ContentBlockError } from "@itqanak/content";

import { contentErrorResponse, contentErrorStatus } from "./content-http";

describe("managed content HTTP errors", () => {
  it("maps validation, authorization, not-found and concurrency failures", () => {
    expect(contentErrorStatus(new ContentBlockError("INVALID_ACTION"))).toBe(422);
    expect(contentErrorStatus(new ContentBlockError("CONTENT_NOT_FOUND"))).toBe(404);
    expect(contentErrorStatus(new ContentBlockError("VERSION_CONFLICT"))).toBe(409);
    expect(contentErrorStatus(new AuthorizationError(["admin.content.manage"]))).toBe(403);
  });

  it("returns a localized no-store JSON error for API clients", async () => {
    const request = new NextRequest("https://admin.example.test/api/admin/content", {
      headers: { accept: "application/json" },
    });
    const response = contentErrorResponse(
      request,
      new ContentBlockError("SLUG_CONFLICT"),
      "request-1",
      "/en/admin/content",
      "https://admin.example.test",
    );

    expect(response.status).toBe(409);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      error: "SLUG_CONFLICT",
      requestId: "request-1",
    });
  });

  it("uses a 303 same-origin redirect for browser form conflicts", () => {
    const request = new NextRequest("https://admin.example.test/api/admin/content", {
      headers: { accept: "text/html" },
    });
    const response = contentErrorResponse(
      request,
      new ContentBlockError("VERSION_CONFLICT"),
      "request-2",
      "/ar/admin/content",
      "https://admin.example.test",
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://admin.example.test/ar/admin/content?notice=conflict",
    );
  });
});
