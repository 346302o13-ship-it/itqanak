import "server-only";

import { PlatformMessagingService } from "@itqanak/operations";

import { createAuthRuntime } from "./auth-runtime";

export async function createMessagingRuntime() {
  const runtime = await createAuthRuntime();
  return {
    ...runtime,
    messaging: new PlatformMessagingService({ database: runtime.database }),
  };
}

export type MessagingRuntime = Awaited<ReturnType<typeof createMessagingRuntime>>;
