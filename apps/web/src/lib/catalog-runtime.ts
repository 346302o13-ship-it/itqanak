import { CatalogService } from "@itqanak/catalog";

import { loadWebConfig, sharedWebDatabase } from "./auth-runtime";

export interface CatalogRuntime {
  readonly catalog: CatalogService;
  close(): Promise<void>;
}

export function createCatalogRuntime(): CatalogRuntime {
  const config = loadWebConfig();
  const database = sharedWebDatabase(config.databaseUrl ?? "");
  return {
    catalog: new CatalogService({ database }),
    async close() {
      // Pool is process-shared; nothing to tear down per call.
    },
  };
}
