import { describe, expect, it } from "vitest";

import { classifyTargetUrl, isBlockedAddress } from "./ssrf-ip-ranges";

describe("isBlockedAddress", () => {
  it("blocks private / reserved IPv4", () => {
    for (const ip of [
      "0.0.0.0",
      "10.1.2.3",
      "100.64.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "198.18.0.1",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows ordinary public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1"]) {
      expect(isBlockedAddress(ip), ip).toBe(false);
    }
  });

  it("blocks loopback / ULA / link-local / mapped IPv6", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1",
      "::ffff:10.0.0.1",
      "2001:db8::1",
    ]) {
      expect(isBlockedAddress(ip), ip).toBe(true);
    }
  });

  it("allows a public IPv6", () => {
    expect(isBlockedAddress("2606:4700:4700::1111")).toBe(false);
  });

  it("blocks anything that is not a valid IP literal", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("classifyTargetUrl", () => {
  it("accepts an ordinary public https URL", () => {
    expect(classifyTargetUrl("https://example.com/page")).toMatchObject({ ok: true });
  });

  it("rejects non-https schemes", () => {
    expect(classifyTargetUrl("http://example.com")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("file:///etc/passwd")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("ftp://example.com")).toMatchObject({ ok: false });
  });

  it("rejects credentials in the URL", () => {
    expect(classifyTargetUrl("https://user:pass@example.com")).toMatchObject({ ok: false });
  });

  it("rejects private literal hosts (v4 and v6)", () => {
    expect(classifyTargetUrl("https://127.0.0.1/")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("https://169.254.169.254/latest/meta-data/")).toMatchObject({
      ok: false,
    });
    expect(classifyTargetUrl("https://[::1]/")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("https://[fd00::1]/")).toMatchObject({ ok: false });
  });

  it("rejects localhost and internal-suffix names", () => {
    expect(classifyTargetUrl("https://localhost/")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("https://redis.internal/")).toMatchObject({ ok: false });
    expect(classifyTargetUrl("https://db.local/")).toMatchObject({ ok: false });
  });

  it("rejects a garbage string", () => {
    expect(classifyTargetUrl("::::")).toMatchObject({ ok: false });
  });
});
