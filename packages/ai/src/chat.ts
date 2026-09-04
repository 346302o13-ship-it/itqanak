import type {
  GeminiClient,
  GeminiContent,
  GeminiFunctionDeclaration,
  GeminiPart,
} from "./gemini-client.js";

/** Every assistant surface answers through this one function call instead of
 *  plain text — `toolConfig.mode: "ANY"` forces every model turn to call
 *  *some* function, so the response is always structured (text + optional
 *  buttons) and never free-form prose we'd have to parse. */
const PRESENT_ANSWER_TOOL: GeminiFunctionDeclaration = {
  name: "present_answer",
  description:
    "Give your final answer to the user now. Always finish by calling this — never answer in plain text.",
  parameters: {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "The reply shown to the user. Concise — a few sentences at most.",
      },
      actions: {
        type: "array",
        description: "0-3 optional action buttons directly relevant to this answer.",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Short button label." },
            href: {
              type: "string",
              description:
                "An internal relative path such as /ar/services or /ar/services/some-slug.",
            },
          },
          required: ["label", "href"],
        },
      },
    },
    required: ["text"],
  },
};

export interface ChatAction {
  readonly label: string;
  readonly href: string;
}

export interface ChatResult {
  readonly text: string;
  readonly actions: readonly ChatAction[];
  /** Full updated turn history — pass back in on the next call to continue
   *  the conversation. */
  readonly history: readonly GeminiContent[];
}

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export interface ChatOptions {
  readonly systemInstruction: string;
  /** Prior turns, most recent last. Does not include the new user message —
   *  pass that as `userMessage`. */
  readonly history?: readonly GeminiContent[];
  readonly userMessage: string;
  readonly tools?: readonly GeminiFunctionDeclaration[];
  readonly toolExecutor?: ToolExecutor;
  readonly maxOutputTokens?: number;
  readonly temperature?: number;
  /** Tool-call rounds before the model is forced to answer immediately.
   *  Default 6. */
  readonly maxIterations?: number;
}

function isFunctionCallPart(part: GeminiPart): part is GeminiPart & {
  readonly functionCall: { readonly name: string; readonly args?: Record<string, unknown> };
} {
  return part.functionCall !== undefined;
}

function extractText(parts: readonly GeminiPart[]): string {
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function sanitizeActions(value: unknown): readonly ChatAction[] {
  if (!Array.isArray(value)) return [];
  const actions: ChatAction[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) continue;
    const label = (entry as { label?: unknown }).label;
    const href = (entry as { href?: unknown }).href;
    // Internal paths only — never let the model hand back an arbitrary
    // external URL as a clickable button. WhatsApp is the one allowed
    // external destination, since it is already the platform's own support
    // channel and every surface already links to it elsewhere.
    if (
      typeof label === "string" &&
      label.trim().length > 0 &&
      label.length <= 40 &&
      typeof href === "string" &&
      (/^\/(ar|en)(\/|$)/u.test(href) || href.startsWith("https://wa.me/")) &&
      href.length <= 200
    ) {
      actions.push({ label: label.trim(), href });
    }
    if (actions.length >= 3) break;
  }
  return actions;
}

const FALLBACK_TEXT =
  "تعذر إكمال الرد الآن. حاول إعادة صياغة سؤالك أو تواصل معنا مباشرة عبر واتساب.";

/**
 * Runs the full tool-call loop for one user turn: the model may call any of
 * `tools` any number of times (each executed via `toolExecutor`, its result
 * fed back as a "user" turn), and must eventually call `present_answer` to
 * finish. Never throws for a normal conversational failure (falls back to
 * `FALLBACK_TEXT`); a `GeminiAllKeysExhaustedError` from the underlying
 * client still propagates, since that is a distinct "service unavailable"
 * condition the caller should render differently.
 */
export async function runChat(client: GeminiClient, options: ChatOptions): Promise<ChatResult> {
  const tools = options.tools ?? [];
  const allTools = [...tools, PRESENT_ANSWER_TOOL];
  const allowedNames = allTools.map((tool) => tool.name);
  const maxIterations = options.maxIterations ?? 6;
  let history: GeminiContent[] = [
    ...(options.history ?? []),
    { role: "user", parts: [{ text: options.userMessage }] },
  ];

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const forceFinal = iteration === maxIterations - 1;
    const response = await client.generateContent({
      contents: history,
      systemInstruction: { parts: [{ text: options.systemInstruction }] },
      tools: [{ functionDeclarations: allTools }],
      toolConfig: {
        functionCallingConfig: {
          mode: "ANY",
          allowedFunctionNames: forceFinal ? ["present_answer"] : allowedNames,
        },
      },
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens ?? 500,
        ...(options.temperature === undefined ? {} : { temperature: options.temperature }),
      },
    });

    const parts = response.candidates?.[0]?.content?.parts ?? [];
    if (parts.length === 0) {
      return { text: FALLBACK_TEXT, actions: [], history };
    }
    history = [...history, { role: "model", parts }];

    const functionCalls = parts.filter(isFunctionCallPart);
    const presentCall = functionCalls.find((part) => part.functionCall.name === "present_answer");
    if (presentCall !== undefined) {
      const args = presentCall.functionCall.args ?? {};
      const text =
        typeof args.text === "string" && args.text.trim().length > 0
          ? args.text.trim()
          : FALLBACK_TEXT;
      return { text, actions: sanitizeActions(args.actions), history };
    }

    if (functionCalls.length === 0) {
      const text = extractText(parts);
      return { text: text.length > 0 ? text : FALLBACK_TEXT, actions: [], history };
    }

    const responseParts: GeminiPart[] = [];
    for (const call of functionCalls) {
      const { name, args } = call.functionCall;
      try {
        const result = (await options.toolExecutor?.(name, args ?? {})) ?? { error: "no_executor" };
        responseParts.push({ functionResponse: { name, response: result } });
      } catch {
        responseParts.push({ functionResponse: { name, response: { error: "tool_failed" } } });
      }
    }
    history = [...history, { role: "user", parts: responseParts }];
  }

  return { text: FALLBACK_TEXT, actions: [], history };
}
