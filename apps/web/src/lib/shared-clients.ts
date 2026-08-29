import Redis from "ioredis";

import { createDatabase, type DatabaseClient } from "@itqanak/db";

/**
 * Process-shared infrastructure clients for the web server. Building a fresh
 * postgres pool (connect + SCRAM + teardown) or Redis connection per request --
 * every few-second poll included -- is a sustained connect/auth/disconnect load
 * that a spike or a retry loop turns into resource exhaustion. These are
 * memoised on globalThis (surviving dev HMR) and torn down only on process exit.
 *
 * Kept in their own module so server-only consumers (readiness probes) can use
 * them without pulling in `next/headers` via auth-runtime.
 */
const webProcess = globalThis as typeof globalThis & {
  __itqanakWebDatabase?: DatabaseClient;
  __itqanakWebRedis?: Redis;
};

function webDatabasePoolMax(): number {
  const raw = Number(process.env.ITQANAK_WEB_DB_POOL_MAX);
  return Number.isInteger(raw) && raw >= 2 && raw <= 50 ? raw : 15;
}

export function sharedWebDatabase(databaseUrl: string): DatabaseClient {
  webProcess.__itqanakWebDatabase ??= createDatabase(databaseUrl, {
    maxConnections: webDatabasePoolMax(),
  });
  return webProcess.__itqanakWebDatabase;
}

/**
 * One Redis connection for the whole web process, used by the fail-open
 * read/poll throttle and the shallow startup probe. Deliberately separate from
 * the per-request `redisForAuth` connections that gate credential flows: those
 * stay fail-closed and self-heal by reconnecting each request, whereas this
 * shared client reconnects with bounded backoff so a Redis blip cannot wedge it.
 */
export function sharedWebRedis(redisUrl: string): Redis {
  if (webProcess.__itqanakWebRedis === undefined) {
    const client = new Redis(redisUrl, {
      connectTimeout: 3_000,
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (attempt) => Math.min(attempt * 200, 2_000),
    });
    client.on("error", () => undefined);
    webProcess.__itqanakWebRedis = client;
  }
  return webProcess.__itqanakWebRedis;
}
