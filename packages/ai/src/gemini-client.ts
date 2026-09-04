import type { Logger } from "@itqanak/observability";

/**
 * Minimal, dependency-free client for the Gemini `generateContent` REST API
 * (https://ai.google.dev/api/generate-content) — plain `fetch`, no SDK. Two
 * responsibilities live here: rotating across a pool of API keys when one is
 * rate-limited/quota-exhausted, and running the function-calling loop that
 * every assistant surface (visitor/student/admin) shares.
 */

export interface GeminiPart extends Record<string, unknown> {
  readonly text?: string;
  readonly functionCall?: { readonly name: string; readonly args?: Record<string, unknown> };
  readonly functionResponse?: { readonly name: string; readonly response: Record<string, unknown> };
}

/** Only "user" and "model" are valid per the Content schema — a tool result
 *  is sent back as a "user" turn carrying a functionResponse part, there is
 *  no separate "function"/"tool" role in this API. */
export interface GeminiContent {
  readonly role: "user" | "model";
  readonly parts: readonly GeminiPart[];
}

export interface GeminiParameterSchema {
  readonly type: "object" | "string" | "number" | "integer" | "boolean" | "array";
  readonly description?: string;
  readonly properties?: Record<string, GeminiParameterSchema>;
  readonly items?: GeminiParameterSchema;
  readonly enum?: readonly string[];
  readonly required?: readonly string[];
}

export interface GeminiFunctionDeclaration {
  readonly name: string;
  readonly description: string;
  readonly parameters: GeminiParameterSchema;
}

export interface GeminiGenerateRequest {
  readonly contents: readonly GeminiContent[];
  readonly systemInstruction?: { readonly parts: readonly GeminiPart[] };
  readonly tools?: readonly {
    readonly functionDeclarations: readonly GeminiFunctionDeclaration[];
  }[];
  readonly toolConfig?: {
    readonly functionCallingConfig: {
      readonly mode: "AUTO" | "ANY" | "NONE";
      readonly allowedFunctionNames?: readonly string[];
    };
  };
  readonly generationConfig?: {
    readonly maxOutputTokens?: number;
    readonly temperature?: number;
  };
}

export interface GeminiRawResponse {
  readonly candidates?: readonly {
    readonly content?: { readonly role?: string; readonly parts?: readonly GeminiPart[] };
    readonly finishReason?: string;
  }[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
}

export class GeminiRequestError extends Error {
  public constructor(
    public readonly status: number,
    public readonly retryable: boolean,
    public readonly body: unknown,
  ) {
    super(`Gemini request failed with HTTP ${status}`);
    this.name = "GeminiRequestError";
  }
}

/** Every configured key failed (or none were configured). The caller should
 *  show a friendly "temporarily unavailable" message, never the raw error. */
export class GeminiAllKeysExhaustedError extends Error {
  public constructor(public readonly lastError?: unknown) {
    super("All configured Gemini API keys are exhausted or unavailable.");
    this.name = "GeminiAllKeysExhaustedError";
  }
}

const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);

function isRetryable(status: number, body: unknown): boolean {
  if (RETRYABLE_HTTP_STATUS.has(status)) return true;
  const errorStatus = (body as { error?: { status?: string } } | undefined)?.error?.status;
  return errorStatus === "RESOURCE_EXHAUSTED" || errorStatus === "UNAVAILABLE";
}

export interface GeminiClientOptions {
  readonly apiKeys: readonly string[];
  readonly model: string;
  readonly logger?: Logger;
  /** Override for tests; defaults to the real Gemini REST base. */
  readonly baseUrl?: string;
}

export class GeminiClient {
  private readonly apiKeys: readonly string[];
  private readonly model: string;
  private readonly logger: Logger | undefined;
  private readonly baseUrl: string;
  /** Sticky "last known good" key — a successful call keeps using it on the
   *  next request instead of always restarting rotation from key 0. */
  private currentKeyIndex = 0;

  public constructor(options: GeminiClientOptions) {
    this.apiKeys = options.apiKeys;
    this.model = options.model;
    this.logger = options.logger;
    this.baseUrl = options.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta";
  }

  public get isConfigured(): boolean {
    return this.apiKeys.length > 0;
  }

  private async callOnce(
    keyIndex: number,
    request: GeminiGenerateRequest,
  ): Promise<GeminiRawResponse> {
    const key = this.apiKeys[keyIndex];
    if (key === undefined) throw new Error("Invalid Gemini API key index.");
    const url = `${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(key)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = undefined;
      }
      throw new GeminiRequestError(response.status, isRetryable(response.status, body), body);
    }
    return (await response.json()) as GeminiRawResponse;
  }

  /** One `generateContent` call, rotating keys on a retryable failure (rate
   *  limit / quota / transient server error). A non-retryable failure (bad
   *  request, unknown model, …) is the same on every key, so it surfaces
   *  immediately instead of wasting the rest of the pool on a guaranteed
   *  repeat failure. */
  public async generateContent(request: GeminiGenerateRequest): Promise<GeminiRawResponse> {
    if (this.apiKeys.length === 0) {
      throw new GeminiAllKeysExhaustedError(new Error("No Gemini API keys configured."));
    }
    let lastError: unknown;
    for (let attempt = 0; attempt < this.apiKeys.length; attempt += 1) {
      const keyIndex = (this.currentKeyIndex + attempt) % this.apiKeys.length;
      try {
        const result = await this.callOnce(keyIndex, request);
        this.currentKeyIndex = keyIndex;
        return result;
      } catch (error: unknown) {
        lastError = error;
        if (error instanceof GeminiRequestError && !error.retryable) throw error;
        this.logger?.warn("gemini_key_retry", {
          keyIndex,
          attempt,
          status: error instanceof GeminiRequestError ? error.status : undefined,
        });
      }
    }
    this.logger?.error("gemini_all_keys_exhausted", { keyCount: this.apiKeys.length });
    throw new GeminiAllKeysExhaustedError(lastError);
  }
}
