import { describe, expect, it } from "vitest";

import { parseUtmCookie } from "./utm-cookie";

describe("parseUtmCookie", () => {
  it("parses a well-formed cookie value", () => {
    expect(parseUtmCookie(JSON.stringify({ s: "google", m: "cpc", c: "ramadan" }))).toEqual({
      s: "google",
      m: "cpc",
      c: "ramadan",
    });
  });

  it("defaults missing medium/campaign to empty strings", () => {
    expect(parseUtmCookie(JSON.stringify({ s: "whatsapp" }))).toEqual({
      s: "whatsapp",
      m: "",
      c: "",
    });
  });

  it("returns undefined for missing, empty, or malformed input", () => {
    expect(parseUtmCookie(undefined)).toBeUndefined();
    expect(parseUtmCookie("")).toBeUndefined();
    expect(parseUtmCookie("not json")).toBeUndefined();
    expect(parseUtmCookie("null")).toBeUndefined();
    expect(parseUtmCookie("[]")).toBeUndefined();
  });

  it("returns undefined when source is missing or blank", () => {
    expect(parseUtmCookie(JSON.stringify({ m: "cpc" }))).toBeUndefined();
    expect(parseUtmCookie(JSON.stringify({ s: "  " }))).toBeUndefined();
  });
});
