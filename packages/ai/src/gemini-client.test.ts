import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiAllKeysExhaustedError, GeminiClient, GeminiRequestError } from "./gemini-client.js";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const okBody = { candidates: [{ content: { role: "model", parts: [{ text: "pong" }] } }] };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GeminiClient", () => {
  it("succeeds on the first key when it works", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, okBody));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a", "key-b"], model: "gemini-3.6-flash" });
    const result = await client.generateContent({ contents: [] });
    expect(result).toEqual(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("key=key-a");
  });

  it("rotates to the next key on a 429 and stays on it afterwards", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED", message: "quota" } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, okBody))
      .mockResolvedValueOnce(jsonResponse(200, okBody));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a", "key-b"], model: "gemini-3.6-flash" });

    await client.generateContent({ contents: [] });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("key=key-a");
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("key=key-b");

    // Second call starts from the sticky key (b), not back at a.
    await client.generateContent({ contents: [] });
    expect(String(fetchMock.mock.calls[2]?.[0])).toContain("key=key-b");
  });

  it("throws GeminiAllKeysExhaustedError once every key is exhausted", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(429, { error: { status: "RESOURCE_EXHAUSTED" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({
      apiKeys: ["key-a", "key-b", "key-c"],
      model: "gemini-3.6-flash",
    });

    await expect(client.generateContent({ contents: [] })).rejects.toBeInstanceOf(
      GeminiAllKeysExhaustedError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("fails fast on a non-retryable error without trying other keys", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: { status: "INVALID_ARGUMENT" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new GeminiClient({ apiKeys: ["key-a", "key-b"], model: "gemini-3.6-flash" });

    await expect(client.generateContent({ contents: [] })).rejects.toBeInstanceOf(
      GeminiRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws GeminiAllKeysExhaustedError immediately when no keys are configured", async () => {
    const client = new GeminiClient({ apiKeys: [], model: "gemini-3.6-flash" });
    expect(client.isConfigured).toBe(false);
    await expect(client.generateContent({ contents: [] })).rejects.toBeInstanceOf(
      GeminiAllKeysExhaustedError,
    );
  });
});
