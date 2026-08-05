import type { Role } from "./roles.js";

export const orderStates = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "WAITING_FOR_STUDENT",
  "QUOTED",
  "ACCEPTED",
  "IN_PROGRESS",
  "DELIVERED",
  "REVISION_REQUESTED",
  "COMPLETED",
  "CANCELLED",
  "REJECTED",
] as const;

export type OrderState = (typeof orderStates)[number];
/** Service requests are the current product name for orders. */
export type RequestStatus = OrderState;
export const requestStatuses = orderStates;

export interface OrderTransition {
  readonly from: OrderState;
  readonly to: OrderState;
  readonly actorRoles: readonly Role[];
}

export interface OrderTransitionInput {
  readonly from: OrderState;
  readonly to: OrderState;
  readonly actorRole: Role;
}

export class OrderTransitionError extends Error {
  public readonly transition: OrderTransitionInput;

  public constructor(transition: OrderTransitionInput) {
    super(
      `The ${transition.actorRole} role cannot transition an order from ${transition.from} to ${transition.to}.`,
    );
    this.name = "OrderTransitionError";
    this.transition = transition;
  }
}

const staff = ["ADMIN", "SYSTEM"] as const satisfies readonly Role[];
const studentOrStaff = ["STUDENT", "ADMIN", "SYSTEM"] as const satisfies readonly Role[];

/**
 * The sole transition policy for service requests. UI routes, workers, and
 * future APIs must call canTransitionOrder/assertOrderTransition rather than
 * embedding their own state checks.
 */
export const orderTransitions: readonly OrderTransition[] = [
  { from: "DRAFT", to: "SUBMITTED", actorRoles: studentOrStaff },
  { from: "DRAFT", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "SUBMITTED", to: "UNDER_REVIEW", actorRoles: staff },
  { from: "SUBMITTED", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "SUBMITTED", to: "REJECTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "WAITING_FOR_STUDENT", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "QUOTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "REJECTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "CANCELLED", actorRoles: staff },
  { from: "WAITING_FOR_STUDENT", to: "SUBMITTED", actorRoles: studentOrStaff },
  { from: "WAITING_FOR_STUDENT", to: "UNDER_REVIEW", actorRoles: staff },
  { from: "WAITING_FOR_STUDENT", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "WAITING_FOR_STUDENT", to: "REJECTED", actorRoles: staff },
  { from: "QUOTED", to: "ACCEPTED", actorRoles: studentOrStaff },
  { from: "QUOTED", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "QUOTED", to: "REJECTED", actorRoles: staff },
  { from: "ACCEPTED", to: "IN_PROGRESS", actorRoles: staff },
  { from: "ACCEPTED", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "IN_PROGRESS", to: "WAITING_FOR_STUDENT", actorRoles: staff },
  { from: "IN_PROGRESS", to: "DELIVERED", actorRoles: staff },
  { from: "IN_PROGRESS", to: "CANCELLED", actorRoles: staff },
  { from: "DELIVERED", to: "REVISION_REQUESTED", actorRoles: studentOrStaff },
  { from: "DELIVERED", to: "COMPLETED", actorRoles: studentOrStaff },
  { from: "REVISION_REQUESTED", to: "IN_PROGRESS", actorRoles: staff },
  { from: "REVISION_REQUESTED", to: "DELIVERED", actorRoles: staff },
] as const;

export function isOrderState(value: string): value is OrderState {
  return (orderStates as readonly string[]).includes(value);
}

export function allowedOrderTransitions(from: OrderState, actorRole: Role): readonly OrderState[] {
  return orderTransitions
    .filter((transition) => transition.from === from && transition.actorRoles.includes(actorRole))
    .map((transition) => transition.to);
}

export function canTransitionOrder(input: OrderTransitionInput): boolean;
export function canTransitionOrder(from: OrderState, to: OrderState, actorRole: Role): boolean;
export function canTransitionOrder(
  inputOrFrom: OrderTransitionInput | OrderState,
  maybeTo?: OrderState,
  maybeActorRole?: Role,
): boolean {
  const input: OrderTransitionInput =
    typeof inputOrFrom === "string"
      ? { from: inputOrFrom, to: maybeTo as OrderState, actorRole: maybeActorRole as Role }
      : inputOrFrom;

  return orderTransitions.some(
    (transition) =>
      transition.from === input.from &&
      transition.to === input.to &&
      transition.actorRoles.includes(input.actorRole),
  );
}

export function assertOrderTransition(input: OrderTransitionInput): void;
export function assertOrderTransition(from: OrderState, to: OrderState, actorRole: Role): void;
export function assertOrderTransition(
  inputOrFrom: OrderTransitionInput | OrderState,
  maybeTo?: OrderState,
  maybeActorRole?: Role,
): void {
  const input: OrderTransitionInput =
    typeof inputOrFrom === "string"
      ? { from: inputOrFrom, to: maybeTo as OrderState, actorRole: maybeActorRole as Role }
      : inputOrFrom;

  if (!canTransitionOrder(input)) {
    throw new OrderTransitionError(input);
  }
}

export const canTransitionRequest = canTransitionOrder;
export const assertRequestTransition = assertOrderTransition;
