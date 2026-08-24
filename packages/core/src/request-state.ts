import type { Role } from "./roles.js";

export const requestStatuses = [
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

export type RequestStatus = (typeof requestStatuses)[number];

export interface RequestTransition {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
  readonly actorRoles: readonly Role[];
}

export interface RequestTransitionInput {
  readonly from: RequestStatus;
  readonly to: RequestStatus;
  readonly actorRole: Role;
}

export class RequestTransitionError extends Error {
  public readonly transition: RequestTransitionInput;

  public constructor(transition: RequestTransitionInput) {
    super(
      `The ${transition.actorRole} role cannot transition a request from ${transition.from} to ${transition.to}.`,
    );
    this.name = "RequestTransitionError";
    this.transition = transition;
  }
}

const staff = ["ADMIN", "SYSTEM"] as const satisfies readonly Role[];
const studentOrStaff = ["STUDENT", "ADMIN", "SYSTEM"] as const satisfies readonly Role[];

/**
 * The sole workflow policy for service requests. Permissions and ownership are
 * separate authorization checks; satisfying this matrix alone never grants
 * access to a request.
 */
export const requestTransitions: readonly RequestTransition[] = [
  { from: "DRAFT", to: "SUBMITTED", actorRoles: studentOrStaff },
  { from: "DRAFT", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "SUBMITTED", to: "UNDER_REVIEW", actorRoles: staff },
  { from: "SUBMITTED", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "SUBMITTED", to: "REJECTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "WAITING_FOR_STUDENT", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "QUOTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "IN_PROGRESS", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "REJECTED", actorRoles: staff },
  { from: "UNDER_REVIEW", to: "CANCELLED", actorRoles: staff },
  { from: "WAITING_FOR_STUDENT", to: "SUBMITTED", actorRoles: studentOrStaff },
  { from: "WAITING_FOR_STUDENT", to: "UNDER_REVIEW", actorRoles: staff },
  { from: "WAITING_FOR_STUDENT", to: "CANCELLED", actorRoles: studentOrStaff },
  { from: "WAITING_FOR_STUDENT", to: "REJECTED", actorRoles: staff },
  { from: "QUOTED", to: "ACCEPTED", actorRoles: studentOrStaff },
  // Rejecting a commercial quote reopens review/negotiation; it is not a
  // rejection of the student's service request.
  { from: "QUOTED", to: "UNDER_REVIEW", actorRoles: studentOrStaff },
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

export function isRequestStatus(value: string): value is RequestStatus {
  return (requestStatuses as readonly string[]).includes(value);
}

export function getAllowedRequestTransitions(
  from: RequestStatus,
  actorRole: Role,
): readonly RequestStatus[] {
  return requestTransitions
    .filter((transition) => transition.from === from && transition.actorRoles.includes(actorRole))
    .map((transition) => transition.to);
}

export function canTransitionRequest(input: RequestTransitionInput): boolean;
export function canTransitionRequest(
  from: RequestStatus,
  to: RequestStatus,
  actorRole: Role,
): boolean;
export function canTransitionRequest(
  inputOrFrom: RequestTransitionInput | RequestStatus,
  maybeTo?: RequestStatus,
  maybeActorRole?: Role,
): boolean {
  const input: RequestTransitionInput =
    typeof inputOrFrom === "string"
      ? {
          from: inputOrFrom,
          to: maybeTo as RequestStatus,
          actorRole: maybeActorRole as Role,
        }
      : inputOrFrom;

  return requestTransitions.some(
    (transition) =>
      transition.from === input.from &&
      transition.to === input.to &&
      transition.actorRoles.includes(input.actorRole),
  );
}

export function assertRequestTransition(input: RequestTransitionInput): void;
export function assertRequestTransition(
  from: RequestStatus,
  to: RequestStatus,
  actorRole: Role,
): void;
export function assertRequestTransition(
  inputOrFrom: RequestTransitionInput | RequestStatus,
  maybeTo?: RequestStatus,
  maybeActorRole?: Role,
): void {
  const input: RequestTransitionInput =
    typeof inputOrFrom === "string"
      ? {
          from: inputOrFrom,
          to: maybeTo as RequestStatus,
          actorRole: maybeActorRole as Role,
        }
      : inputOrFrom;

  if (!canTransitionRequest(input)) {
    throw new RequestTransitionError(input);
  }
}

/**
 * Applies the pure workflow decision and returns the next status. Persisting it
 * with an optimistic version predicate remains the caller's responsibility.
 */
export function transitionRequest(input: RequestTransitionInput): RequestStatus;
export function transitionRequest(
  from: RequestStatus,
  to: RequestStatus,
  actorRole: Role,
): RequestStatus;
export function transitionRequest(
  inputOrFrom: RequestTransitionInput | RequestStatus,
  maybeTo?: RequestStatus,
  maybeActorRole?: Role,
): RequestStatus {
  const input: RequestTransitionInput =
    typeof inputOrFrom === "string"
      ? {
          from: inputOrFrom,
          to: maybeTo as RequestStatus,
          actorRole: maybeActorRole as Role,
        }
      : inputOrFrom;

  assertRequestTransition(input);
  return input.to;
}

// Phase 1 used "order" terminology. These aliases keep existing consumers
// source-compatible while Request remains the canonical Phase 3 vocabulary.
export const orderStates = requestStatuses;
export type OrderState = RequestStatus;
export type OrderTransition = RequestTransition;
export type OrderTransitionInput = RequestTransitionInput;
export { RequestTransitionError as OrderTransitionError };
export const orderTransitions = requestTransitions;
export const isOrderState = isRequestStatus;
export const allowedOrderTransitions = getAllowedRequestTransitions;
export const getAllowedTransitions = getAllowedRequestTransitions;
export const canTransitionOrder = canTransitionRequest;
export const assertOrderTransition = assertRequestTransition;
export const transitionOrder = transitionRequest;
