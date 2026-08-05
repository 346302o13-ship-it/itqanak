import { describe, expect, it } from "vitest";

import { assertOrderTransition, canTransitionOrder } from "./request-state.js";

describe("request state machine", () => {
  it("allows a student to submit a draft", () => {
    expect(canTransitionOrder("DRAFT", "SUBMITTED", "STUDENT")).toBe(true);
  });

  it("does not allow a visitor to mutate a request", () => {
    expect(canTransitionOrder("DRAFT", "SUBMITTED", "VISITOR")).toBe(false);
  });

  it("throws when a forbidden transition is asserted", () => {
    expect(() => assertOrderTransition("COMPLETED", "IN_PROGRESS", "ADMIN")).toThrow(
      "cannot transition",
    );
  });
});
