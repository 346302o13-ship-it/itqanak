import "server-only";

import { ContentBlockService } from "@itqanak/content";

import { createAuthRuntime } from "./auth-runtime";

export async function createContentRuntime() {
  const runtime = await createAuthRuntime();
  return {
    ...runtime,
    content: new ContentBlockService({ database: runtime.database }),
  };
}

export type ContentRuntime = Awaited<ReturnType<typeof createContentRuntime>>;
