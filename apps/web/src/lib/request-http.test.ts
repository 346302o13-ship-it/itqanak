import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { CsrfError } from "@itqanak/auth";
import { RequestDomainError } from "@itqanak/requests";

import {
  parseRequestListQuery,
  positiveVersion,
  localeFromRequestPath,
  requestErrorStatus,
  requestErrorResponse,
  requestFormErrorResponse,
  requestFormUnauthorizedResponse,
} from "./request-http";

describe("request HTTP boundary", () => {
  it("derives locale only from a leading route segment", () => {
    expect(localeFromRequestPath("/en/student/requests/new")).toBe("en");
    expect(localeFromRequestPath("/ar/student/requests/new")).toBe("ar");
    expect(localeFromRequestPath("//en/student")).toBe("ar");
    expect(localeFromRequestPath("/english/student")).toBe("ar");
  });

  it("maps only classified domain failures to stable status codes", () => {
    expect(requestErrorStatus(new RequestDomainError("REQUEST_NOT_FOUND"))).toBe(404);
    expect(requestErrorStatus(new RequestDomainError("VERSION_CONFLICT"))).toBe(409);
    expect(requestErrorStatus(new RequestDomainError("INVALID_REQUEST"))).toBe(400);
    expect(requestErrorStatus(new RequestDomainError("FILE_TOO_LARGE"))).toBe(422);
    expect(requestErrorStatus(new RequestDomainError("UPLOAD_TIMEOUT"))).toBe(408);
    expect(requestErrorStatus(new RequestDomainError("STORAGE_UNAVAILABLE"))).toBe(503);
    expect(requestErrorStatus(new CsrfError())).toBe(403);
    expect(requestErrorStatus(new Error("private detail"))).toBe(500);
  });

  it("bounds and allowlists list-query controls", () => {
    expect(
      parseRequestListQuery({
        page: "999999",
        q: `  ${"x".repeat(120)}  `,
        status: "SUBMITTED",
        sort: "oldest",
        service: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      }),
    ).toMatchObject({
      page: 1_000,
      pageSize: 20,
      status: "SUBMITTED",
      sort: "oldest",
      serviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    expect(parseRequestListQuery({ status: "PRIVATE", sort: "sql desc" })).toMatchObject({
      page: 1,
      sort: "newest",
    });
  });

  it("requires a positive optimistic-concurrency version", () => {
    expect(positiveVersion("4")).toBe(4);
    expect(() => positiveVersion("0")).toThrow(RequestDomainError);
    expect(() => positiveVersion("1 OR 1=1")).toThrow(RequestDomainError);
  });

  it("progressively redirects browser forms using fixed safe notices", () => {
    const request = new NextRequest("https://attacker.invalid/api/student/requests", {
      method: "POST",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    const conflict = requestFormErrorResponse(
      request,
      new RequestDomainError("VERSION_CONFLICT"),
      "request-id",
      "/ar/student/requests/ITQ-2026-000001",
      "https://itqanak.example",
    );
    expect(conflict.status).toBe(303);
    expect(conflict.headers.get("location")).toBe(
      "https://itqanak.example/ar/student/requests/ITQ-2026-000001?notice=conflict",
    );

    const login = requestFormUnauthorizedResponse(
      request,
      "request-id",
      "/ar/student/requests/new",
      "https://itqanak.example",
    );
    expect(login.status).toBe(303);
    expect(login.headers.get("location")).toBe(
      "https://itqanak.example/ar/auth/login?next=%2Far%2Fstudent%2Frequests%2Fnew",
    );

    const englishLogin = requestFormUnauthorizedResponse(
      request,
      "request-id",
      "/en/student/requests/new",
      "https://itqanak.example",
    );
    expect(englishLogin.headers.get("location")).toBe(
      "https://itqanak.example/en/auth/login?next=%2Fen%2Fstudent%2Frequests%2Fnew",
    );

    const englishNotFound = requestFormErrorResponse(
      request,
      new RequestDomainError("REQUEST_NOT_FOUND"),
      "request-id",
      "/en/student/requests/ITQ-2026-000001",
      "https://itqanak.example",
    );
    expect(englishNotFound.headers.get("location")).toBe(
      "https://itqanak.example/en/student/requests?notice=not_found",
    );
  });

  it("never serializes unknown error details", async () => {
    const response = requestErrorResponse(
      new Error("private filename: student-secret.pdf"),
      "request-id",
    );
    expect(response.status).toBe(500);
    const body = (await response.json()) as Readonly<Record<string, unknown>>;
    expect(JSON.stringify(body)).not.toContain("student-secret.pdf");
    expect(body).toMatchObject({ error: "REQUEST_FAILED", requestId: "request-id" });
  });

  it("preserves real authorization and not-found statuses for API clients", () => {
    const request = new NextRequest("https://itqanak.example/api/student/requests", {
      headers: { accept: "application/json" },
    });
    expect(
      requestFormErrorResponse(
        request,
        new RequestDomainError("REQUEST_FORBIDDEN"),
        "request-id",
        "/ar/student",
        "https://itqanak.example",
      ).status,
    ).toBe(403);
    expect(
      requestFormErrorResponse(
        request,
        new RequestDomainError("REQUEST_NOT_FOUND"),
        "request-id",
        "/ar/student/requests",
        "https://itqanak.example",
      ).status,
    ).toBe(404);
  });
});
