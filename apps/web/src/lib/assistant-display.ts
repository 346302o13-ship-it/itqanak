import "server-only";

import type { AssistantMessageRow } from "@itqanak/requests";

export interface AssistantDisplayAction {
  readonly label: string;
  readonly href: string;
}

export interface AssistantDisplayMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly actions?: readonly AssistantDisplayAction[];
}

/**
 * Persisted rows hold every raw turn (the user's text, intermediate tool
 * calls, tool results, the final present_answer call) — exactly what
 * @itqanak/ai's chat loop needs to resume the conversation, but not what a
 * chat bubble should show. This keeps only what a person actually said or
 * was told: a plain user text turn, or a model turn whose only meaningful
 * part is the present_answer call. Everything else (a data-lookup tool call,
 * its JSON result) is invisible scaffolding and is skipped.
 */
export function toDisplayMessages(
  rows: readonly AssistantMessageRow[],
): readonly AssistantDisplayMessage[] {
  const messages: AssistantDisplayMessage[] = [];
  for (const row of rows) {
    if (row.role === "user") {
      const textPart = row.parts.find(
        (part): part is { text: string } => typeof part.text === "string",
      );
      if (textPart !== undefined && textPart.text.trim().length > 0) {
        messages.push({ role: "user", text: textPart.text });
      }
      continue;
    }
    const presentCall = row.parts.find((part) => {
      const call = part.functionCall as { name?: unknown } | undefined;
      return call !== undefined && call.name === "present_answer";
    });
    if (presentCall === undefined) continue;
    const args = (presentCall.functionCall as { args?: { text?: unknown; actions?: unknown } })
      .args;
    const text = typeof args?.text === "string" ? args.text : "";
    if (text.trim().length === 0) continue;
    const actions = Array.isArray(args?.actions)
      ? args.actions
          .filter(
            (action): action is AssistantDisplayAction =>
              typeof action === "object" &&
              action !== null &&
              typeof (action as { label?: unknown }).label === "string" &&
              typeof (action as { href?: unknown }).href === "string",
          )
          .slice(0, 3)
      : [];
    messages.push({ role: "assistant", text, actions });
  }
  return messages;
}
