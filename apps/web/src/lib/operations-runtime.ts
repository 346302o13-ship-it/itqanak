import "server-only";

import { PlatformOperationsService } from "@itqanak/operations";

import { createAuthRuntime } from "./auth-runtime";

export async function createOperationsRuntime() {
  const runtime = await createAuthRuntime();
  return {
    ...runtime,
    operations: new PlatformOperationsService({ database: runtime.database }),
  };
}

export type OperationsRuntime = Awaited<ReturnType<typeof createOperationsRuntime>>;
