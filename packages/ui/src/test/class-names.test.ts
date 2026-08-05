import { describe, expect, it } from "vitest";

import { classNames } from "../components/class-names.js";

describe("classNames", () => {
  it("keeps meaningful classes in the supplied order", () => {
    expect(classNames("base", false, undefined, "is-active", null)).toBe("base is-active");
  });
});
