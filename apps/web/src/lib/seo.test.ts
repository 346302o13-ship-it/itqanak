import { describe, expect, it } from "vitest";

import { publicMetadataBase } from "./seo";

describe("publicMetadataBase", () => {
  it("keeps only an HTTP(S) public origin", () => {
    expect(publicMetadataBase("https://user:password@example.test/private?q=1#fragment").href).toBe(
      "https://example.test/",
    );
  });

  it("falls back safely for invalid or unsupported URLs", () => {
    expect(publicMetadataBase("not a URL").href).toBe("http://127.0.0.1:8080/");
    expect(publicMetadataBase("javascript:alert(1)").href).toBe("http://127.0.0.1:8080/");
  });
});
