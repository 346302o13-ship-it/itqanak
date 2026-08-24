import { CatalogService } from "@itqanak/catalog";
import { closeDatabase, createDatabase } from "@itqanak/db";

import { loadWebConfig } from "./auth-runtime";

export interface CatalogRuntime {
  readonly catalog: CatalogService;
  close(): Promise<void>;
}

export function createCatalogRuntime(): CatalogRuntime {
  const config = loadWebConfig();
  const database = createDatabase(config.databaseUrl ?? "");
  return {
    catalog: new CatalogService({ database }),
    async close() {
      await closeDatabase(database);
    },
  };
}
