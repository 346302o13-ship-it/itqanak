export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { registerNodeInstrumentation } = await import("./instrumentation-node");
  await registerNodeInstrumentation();
}

/**
 * Uncaught Server Component / route-handler errors otherwise produce no operator
 * signal beyond a rotated stderr line. Emit a redacted structured record — never
 * the message or stack, which can carry user content.
 */
export async function onRequestError(
  error: unknown,
  request: Readonly<{ path?: string; method?: string }>,
  context: Readonly<{ routerKind?: string; routePath?: string; renderType?: string }>,
): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    const { createLogger } = await import("@itqanak/observability");
    createLogger({ service: "web", environment: process.env.NODE_ENV || "production" }).error(
      "server_request_error",
      {
        errorName: error instanceof Error ? error.name : "UnknownError",
        digest:
          error instanceof Error && typeof (error as { digest?: unknown }).digest === "string"
            ? String((error as { digest?: unknown }).digest).slice(0, 64)
            : undefined,
        method: request.method,
        routePath: context.routePath,
        routerKind: context.routerKind,
        renderType: context.renderType,
      },
    );
  } catch {
    // Reporting must never throw.
  }
}
