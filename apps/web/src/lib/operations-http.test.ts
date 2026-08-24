import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AuthorizationError } from "@itqanak/auth";
import { OperationalControlError } from "@itqanak/operations";

import { operationsErrorResponse, operationsErrorStatus } from "./operations-http";

describe("operational controls HTTP errors", () => {
  it("maps authorization, confirmation, concurrency and availability failures", () => {
    expect(operationsErrorStatus(new AuthorizationError(["admin.operations.manage"]))).toBe(403);
    expect(operationsErrorStatus(new OperationalControlError("CONFIRMATION_REQUIRED"))).toBe(422);
    expect(operationsErrorStatus(new OperationalControlError("VERSION_CONFLICT"))).toBe(409);
    expect(operationsErrorStatus(new OperationalControlError("SETTINGS_UNAVAILABLE"))).toBe(503);
  });

  it("returns no-store JSON and a same-origin browser redirect", async () => {
    const jsonRequest = new NextRequest("https://admin.example.test/api/admin/operations", {
      headers: { accept: "application/json" },
    });
    const json = operationsErrorResponse(
      jsonRequest,
      new OperationalControlError("VERSION_CONFLICT"),
      "request-1",
      "/en/admin/operations",
      "https://admin.example.test",
    );
    expect(json.status).toBe(409);
    expect(json.headers.get("cache-control")).toBe("no-store");
    await expect(json.json()).resolves.toMatchObject({ error: "VERSION_CONFLICT" });

    const htmlRequest = new NextRequest("https://admin.example.test/api/admin/operations", {
      headers: { accept: "text/html" },
    });
    const html = operationsErrorResponse(
      htmlRequest,
      new OperationalControlError("VERSION_CONFLICT"),
      "request-2",
      "/ar/admin/operations",
      "https://admin.example.test",
    );
    expect(html.status).toBe(303);
    expect(html.headers.get("location")).toBe(
      "https://admin.example.test/ar/admin/operations?notice=conflict",
    );
  });
});
