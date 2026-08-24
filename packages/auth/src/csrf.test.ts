import { describe, expect, it } from "vitest";

import {
  assertCsrfToken,
  assertExpectedFormContentLength,
  assertExpectedFormContentType,
  assertExpectedRawUploadContentType,
  assertTrustedHost,
  assertTrustedOrigin,
  CsrfError,
} from "./csrf.js";

const productionUrls = {
  publicAppUrl: "https://app.itqanak.test",
  adminAppUrl: "https://admin.itqanak.test/ar/admin",
  development: false,
} as const;

describe("CSRF request validation", () => {
  it("accepts only configured production origins and hosts", () => {
    expect(() =>
      assertTrustedOrigin({ ...productionUrls, origin: "https://app.itqanak.test" }),
    ).not.toThrow();
    expect(() =>
      assertTrustedHost({ ...productionUrls, host: "admin.itqanak.test" }),
    ).not.toThrow();

    expect(() =>
      assertTrustedOrigin({ ...productionUrls, origin: "https://attacker.example.test" }),
    ).toThrow(CsrfError);
    expect(() => assertTrustedHost({ ...productionUrls, host: "app.itqanak.test:443" })).toThrow(
      CsrfError,
    );
  });

  it("permits the explicit local development origins but not arbitrary ones", () => {
    const developmentUrls = { ...productionUrls, development: true };

    expect(() =>
      assertTrustedOrigin({ ...developmentUrls, origin: "http://localhost:8080" }),
    ).not.toThrow();
    expect(() => assertTrustedHost({ ...developmentUrls, host: "127.0.0.1:8080" })).not.toThrow();
    expect(() => assertTrustedHost({ ...developmentUrls, host: "localhost:3000" })).toThrow(
      CsrfError,
    );
  });

  it("requires a sufficiently long matching double-submit token", () => {
    const token = "t".repeat(32);

    expect(() => assertCsrfToken(token, token)).not.toThrow();
    expect(() => assertCsrfToken(token, `${token}x`)).toThrow(CsrfError);
    expect(() => assertCsrfToken(token, "short")).toThrow(CsrfError);
    expect(() => assertCsrfToken(undefined, token)).toThrow(CsrfError);
  });

  it("requires standard URL-encoded form submissions", () => {
    expect(() =>
      assertExpectedFormContentType("application/x-www-form-urlencoded; charset=UTF-8"),
    ).not.toThrow();
    expect(() => assertExpectedFormContentType("application/json")).toThrow(CsrfError);
    expect(() => assertExpectedFormContentType(null)).toThrow(CsrfError);
  });

  it("rejects missing, malformed, or oversized protected form bodies before parsing", () => {
    expect(() => assertExpectedFormContentLength("1024")).not.toThrow();
    expect(() => assertExpectedFormContentLength(null)).toThrow(CsrfError);
    expect(() => assertExpectedFormContentLength("unknown")).toThrow(CsrfError);
    expect(() => assertExpectedFormContentLength(String(64 * 1_024 + 1))).toThrow(CsrfError);
  });

  it("accepts only a raw media type for the streaming upload protocol", () => {
    expect(() => assertExpectedRawUploadContentType("application/pdf")).not.toThrow();
    expect(() => assertExpectedRawUploadContentType("image/png; charset=binary")).not.toThrow();
    expect(() => assertExpectedRawUploadContentType("multipart/form-data; boundary=x")).toThrow(
      CsrfError,
    );
    expect(() => assertExpectedRawUploadContentType(null)).toThrow(CsrfError);
  });
});
