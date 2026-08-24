import "server-only";

import { FinanceService } from "@itqanak/finance";

import { createAuthRuntime } from "./auth-runtime";

export async function createFinanceRuntime() {
  const runtime = await createAuthRuntime();
  return {
    ...runtime,
    finance: new FinanceService({ database: runtime.database }),
  };
}

export type FinanceRuntime = Awaited<ReturnType<typeof createFinanceRuntime>>;
