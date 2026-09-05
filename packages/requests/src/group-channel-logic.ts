import { createHash } from "node:crypto";

import { RequestDomainError } from "./errors.js";

export const GROUP_CHANNEL_BODY_MAX = 10_000;
export const GROUP_CHANNEL_PREVIEW_MAX = 320;

/** Trim, normalise newlines, and bound a group-channel message body the same way
 *  the unified conversation does. */
export function normalizeGroupChannelBody(value: unknown): string {
  const body = typeof value === "string" ? value.replace(/\r\n?/gu, "\n").trim() : "";
  if (body.length === 0 || body.length > GROUP_CHANNEL_BODY_MAX || body.includes("\0")) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  return body;
}

export function groupChannelFingerprint(parts: Readonly<Record<string, string | number>>): string {
  return createHash("sha256").update(JSON.stringify(parts), "utf8").digest("hex");
}

/** A single-line, length-bounded preview used for the announcement bell/push
 *  body — collapses whitespace so a multi-line announcement stays legible. */
export function announcementPreview(body: string): string {
  const collapsed = body.replace(/\s+/gu, " ").trim();
  if (collapsed.length <= GROUP_CHANNEL_PREVIEW_MAX) return collapsed;
  return `${collapsed.slice(0, GROUP_CHANNEL_PREVIEW_MAX - 1).trimEnd()}…`;
}

export interface GroupUnreadInput {
  readonly lastReadAt: Date | undefined;
  /** Live (non-deleted) messages not authored by the viewer, newest first or any order. */
  readonly messageTimes: readonly Date[];
}

/** Count messages sent strictly after the viewer's read cursor. With no cursor
 *  every provided message counts (the caller already excluded the viewer's own
 *  and deleted rows). */
export function computeGroupUnread(input: GroupUnreadInput): number {
  const cutoff = input.lastReadAt?.getTime();
  if (cutoff === undefined) return input.messageTimes.length;
  return input.messageTimes.reduce((total, at) => (at.getTime() > cutoff ? total + 1 : total), 0);
}

/** Validate an optimistic-concurrency version supplied by an admin editing the
 *  posting policy. */
export function assertSettingsVersion(expected: unknown, actual: number): void {
  const parsed = typeof expected === "number" ? expected : Number(expected);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new RequestDomainError("INVALID_MESSAGE");
  }
  if (parsed !== actual) {
    throw new RequestDomainError("VERSION_CONFLICT");
  }
}
