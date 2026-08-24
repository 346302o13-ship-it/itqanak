import { describe, expect, it } from "vitest";

import { localizedManagedContentHref } from "./managed-content-blocks";

describe("managed content links", () => {
  it("keeps internal actions on the viewer's current locale", () => {
    expect(localizedManagedContentHref("/ar/services", "en")).toBe("/en/services");
    expect(localizedManagedContentHref("/ar?from=notice", "en")).toBe("/en?from=notice");
    expect(localizedManagedContentHref("/en#faq", "ar")).toBe("/ar#faq");
    expect(localizedManagedContentHref("/en/student", "ar")).toBe("/ar/student");
    expect(localizedManagedContentHref("/services", "ar")).toBe("/ar/services");
    expect(localizedManagedContentHref("/", "en")).toBe("/en");
  });
});
