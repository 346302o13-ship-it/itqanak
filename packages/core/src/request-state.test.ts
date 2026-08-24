import { describe, expect, it } from "vitest";

import {
  assertOrderTransition,
  canTransitionOrder,
  canTransitionRequest,
  getAllowedRequestTransitions,
  RequestTransitionError,
  transitionRequest,
} from "./request-state.js";

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

  it("returns only transitions available to the given actor role", () => {
    expect(getAllowedRequestTransitions("SUBMITTED", "STUDENT")).toEqual(["CANCELLED"]);
    expect(getAllowedRequestTransitions("SUBMITTED", "ADMIN")).toEqual([
      "UNDER_REVIEW",
      "CANCELLED",
      "REJECTED",
    ]);
  });

  it("uses Request as the canonical API while retaining Order aliases", () => {
    expect(canTransitionRequest("DRAFT", "SUBMITTED", "STUDENT")).toBe(
      canTransitionOrder("DRAFT", "SUBMITTED", "STUDENT"),
    );
    expect(transitionRequest("DRAFT", "SUBMITTED", "STUDENT")).toBe("SUBMITTED");
  });

  it("fails closed for terminal states and visitor actors", () => {
    expect(getAllowedRequestTransitions("COMPLETED", "ADMIN")).toEqual([]);
    expect(canTransitionRequest("DRAFT", "SUBMITTED", "VISITOR")).toBe(false);
    expect(() => transitionRequest("REJECTED", "DRAFT", "SYSTEM")).toThrow(RequestTransitionError);
  });
});
