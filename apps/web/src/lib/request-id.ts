import { randomUUID } from "node:crypto";

const requestIdPattern = /^[a-zA-Z0-9._-]{8,128}$/;

export function getRequestId(value: string | null): string {
  if (value !== null && requestIdPattern.test(value)) {
    return value;
  }
  return randomUUID();
}
