import { waitFor } from "./backoff.js";

export interface PeriodicHeartbeatOptions {
  readonly intervalMs: number;
  readonly signal: AbortSignal;
  readonly heartbeat: () => Promise<void>;
  readonly onFailure: () => void;
}

/**
 * Keeps liveness independent from potentially slow outbox/storage work. A
 * failed dependency check intentionally leaves the heartbeat stale so Docker
 * health can mark the worker unavailable, but the loop keeps retrying.
 */
export async function runPeriodicHeartbeat(options: PeriodicHeartbeatOptions): Promise<void> {
  while (!options.signal.aborted) {
    await waitFor(options.intervalMs, options.signal);
    if (options.signal.aborted) {
      return;
    }
    try {
      await options.heartbeat();
    } catch {
      options.onFailure();
    }
  }
}
