import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiClient } from "./gemini-client.js";
import { runChat } from "./chat.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function presentAnswerBody(args: Record<string, unknown>) {
  return {
    candidates: [
      {
        content: {
          role: "model",
          parts: [{ functionCall: { name: "present_answer", args } }],
        },
      },
    ],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runChat", () => {
  it("returns the text and sanitized actions from present_answer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        presentAnswerBody({
          text: "الأسعار تبدأ من ١٥ ريالاً.",
          actions: [
            { label: "الخدمات", href: "/ar/services" },
            { label: "واتساب", href: "https://wa.me/966564202263" },
            { label: "شيء خبيث", href: "https://evil.example.com/steal" },
            { label: "زر خامس لا يظهر", href: "/ar/x" },
            { label: "أيضاً لا يظهر", href: "/ar/y" },
          ],
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a"], model: "gemini-3.6-flash" });

    const result = await runChat(client, {
      systemInstruction: "You are a helpful assistant.",
      userMessage: "كم سعر الخدمة؟",
    });

    expect(result.text).toBe("الأسعار تبدأ من ١٥ ريالاً.");
    // Capped at 3 actions; the malicious external link is dropped entirely.
    expect(result.actions).toEqual([
      { label: "الخدمات", href: "/ar/services" },
      { label: "واتساب", href: "https://wa.me/966564202263" },
      { label: "زر خامس لا يظهر", href: "/ar/x" },
    ]);
  });

  it("executes a requested tool and feeds its result back before finishing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          candidates: [
            {
              content: {
                role: "model",
                parts: [{ functionCall: { name: "get_my_requests", args: { limit: 3 } } }],
              },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(presentAnswerBody({ text: "عندك طلبان نشطان." })));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a"], model: "gemini-3.6-flash" });
    const toolExecutor = vi.fn().mockResolvedValue({ requests: [{ id: "1" }, { id: "2" }] });

    const result = await runChat(client, {
      systemInstruction: "You are a helpful assistant.",
      userMessage: "وش وضع طلباتي؟",
      tools: [
        {
          name: "get_my_requests",
          description: "List the current student's own requests.",
          parameters: { type: "object", properties: {} },
        },
      ],
      toolExecutor,
    });

    expect(toolExecutor).toHaveBeenCalledWith("get_my_requests", { limit: 3 });
    expect(result.text).toBe("عندك طلبان نشطان.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The second call's history carries the tool's result back as a "user" turn.
    const secondCallBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as {
      contents: readonly { role: string; parts: readonly Record<string, unknown>[] }[];
    };
    const toolResultTurn = secondCallBody.contents.at(-1);
    expect(toolResultTurn?.role).toBe("user");
    expect(toolResultTurn?.parts[0]?.functionResponse).toBeDefined();
  });

  it("forces a final answer once maxIterations is reached", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as {
        toolConfig?: { functionCallingConfig?: { allowedFunctionNames?: readonly string[] } };
      };
      const allowed = body.toolConfig?.functionCallingConfig?.allowedFunctionNames ?? [];
      if (allowed.length === 1 && allowed[0] === "present_answer") {
        return jsonResponse(presentAnswerBody({ text: "تم إنهاء المحادثة." }));
      }
      return jsonResponse({
        candidates: [
          {
            content: {
              role: "model",
              parts: [{ functionCall: { name: "loopy_tool", args: {} } }],
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a"], model: "gemini-3.6-flash" });

    const result = await runChat(client, {
      systemInstruction: "You are a helpful assistant.",
      userMessage: "test",
      maxIterations: 3,
      tools: [{ name: "loopy_tool", description: "keeps going", parameters: { type: "object" } }],
      toolExecutor: async () => ({ ok: true }),
    });

    expect(result.text).toBe("تم إنهاء المحادثة.");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
