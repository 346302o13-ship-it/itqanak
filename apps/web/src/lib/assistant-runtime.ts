import "server-only";

import { GeminiClient } from "@itqanak/ai";
import { createLogger, type Logger } from "@itqanak/observability";

import { loadWebConfig } from "./auth-runtime";

const webProcess = globalThis as typeof globalThis & {
  __itqanakGeminiClient?: GeminiClient;
  __itqanakAssistantLogger?: Logger;
};

/** Shared logger for the assistant surfaces — lets runChat record why a turn
 *  produced no answer (safety block, MAX_TOKENS) without each route wiring its
 *  own. */
export function assistantLogger(): Logger {
  const config = loadWebConfig();
  webProcess.__itqanakAssistantLogger ??= createLogger({
    service: config.serviceName,
    environment: config.nodeEnv,
    level: config.logLevel,
  });
  return webProcess.__itqanakAssistantLogger;
}

/**
 * One `GeminiClient` for the process lifetime, not per request — its "stick
 * with the last working key" rotation state (see @itqanak/ai) is only useful
 * if it survives across requests, the same reasoning `processObjectStorage`
 * in request-runtime.ts already applies to the S3 client.
 */
export function geminiClient(): GeminiClient {
  const config = loadWebConfig();
  webProcess.__itqanakGeminiClient ??= new GeminiClient({
    apiKeys: config.assistant.geminiApiKeys,
    model: config.assistant.model,
    logger: createLogger({
      service: config.serviceName,
      environment: config.nodeEnv,
      level: config.logLevel,
    }),
  });
  return webProcess.__itqanakGeminiClient;
}
