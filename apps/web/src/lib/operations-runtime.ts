import "server-only";

import {
  OutboxMonitorService,
  PlatformOperationsService,
  PlatformRetentionService,
} from "@itqanak/operations";

import { createAuthRuntime } from "./auth-runtime";

export async function createOperationsRuntime() {
  const runtime = await createAuthRuntime();
  return {
    ...runtime,
    operations: new PlatformOperationsService({ database: runtime.database }),
    retention: new PlatformRetentionService({ database: runtime.database }),
    outboxMonitor: new OutboxMonitorService({ database: runtime.database }),
  };
}

export type OperationsRuntime = Awaited<ReturnType<typeof createOperationsRuntime>>;
