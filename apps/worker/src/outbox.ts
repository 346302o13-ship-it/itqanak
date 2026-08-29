import type { DatabaseClient } from "@itqanak/db";
import type { Logger } from "@itqanak/observability";

/**
 * Deliberate phase-one seam: future processors claim an outbox row, perform a
 * side effect, then atomically mark delivery/retry. It performs no network
 * notification until the notification phase is explicitly implemented.
 */
export interface OutboxWorkLoop {
  poll(): Promise<void>;
}

export interface OutboxRetentionOptions {
  /** Terminal rows (DELIVERED / DEAD_LETTER) are pruned this many days after processing. */
  readonly terminalRetentionDays?: number;
  /**
   * Rows still unclaimed (PENDING / RETRY / PROCESSING) this many days after
   * creation are pruned too: scan and WhatsApp jobs exhaust their bounded
   * retries in minutes, so anything untouched for months has no consumer.
   */
  readonly unclaimedRetentionDays?: number;
  /** Rows deleted per statement. The sweep repeats until a pass frees fewer. */
  readonly batchSize?: number;
  /** Hard cap on delete statements per sweep so one poll never long-locks the table. */
  readonly maxBatchesPerSweep?: number;
  /** Minimum wall-clock gap between sweeps. */
  readonly minIntervalMs?: number;
  /** Injectable clock for tests. */
  readonly now?: () => number;
}

const DEFAULTS = {
  terminalRetentionDays: 30,
  unclaimedRetentionDays: 90,
  batchSize: 2_000,
  maxBatchesPerSweep: 25,
  minIntervalMs: 3_600_000,
} as const;

type QueryResult = { readonly count?: number };

/**
 * Bounds `outbox_events` growth. Without it the table and its indexes grow
 * without limit -- several event types have no runtime consumer today -- and a
 * full disk stops every write. Runs at most once per `minIntervalMs`, deletes in
 * bounded batches, and never lets a retention error disrupt the worker loop.
 */
export class OutboxRetentionWorkLoop implements OutboxWorkLoop {
  private readonly terminalRetentionDays: number;
  private readonly unclaimedRetentionDays: number;
  private readonly batchSize: number;
  private readonly maxBatchesPerSweep: number;
  private readonly minIntervalMs: number;
  private readonly now: () => number;
  private nextSweepAt = 0;

  public constructor(
    private readonly database: DatabaseClient,
    private readonly logger: Logger,
    options: OutboxRetentionOptions = {},
  ) {
    this.terminalRetentionDays = options.terminalRetentionDays ?? DEFAULTS.terminalRetentionDays;
    this.unclaimedRetentionDays = options.unclaimedRetentionDays ?? DEFAULTS.unclaimedRetentionDays;
    this.batchSize = options.batchSize ?? DEFAULTS.batchSize;
    this.maxBatchesPerSweep = options.maxBatchesPerSweep ?? DEFAULTS.maxBatchesPerSweep;
    this.minIntervalMs = options.minIntervalMs ?? DEFAULTS.minIntervalMs;
    this.now = options.now ?? Date.now;
  }

  public async poll(): Promise<void> {
    const startedAt = this.now();
    if (startedAt < this.nextSweepAt) return;
    this.nextSweepAt = startedAt + this.minIntervalMs;
    try {
      const terminal = await this.sweepTerminal();
      const unclaimed = await this.sweepUnclaimed();
      if (terminal + unclaimed > 0) {
        this.logger.info("outbox_retention_swept", { terminal, unclaimed });
      } else {
        this.logger.debug("outbox_retention_noop");
      }
    } catch (error: unknown) {
      this.logger.warn("outbox_retention_failed", {
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  private async sweepTerminal(): Promise<number> {
    let removed = 0;
    for (let batch = 0; batch < this.maxBatchesPerSweep; batch += 1) {
      const result = (await this.database`
        DELETE FROM outbox_events
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE status IN ('DELIVERED', 'DEAD_LETTER')
            AND processed_at < now() - make_interval(days => ${this.terminalRetentionDays})
          ORDER BY id
          LIMIT ${this.batchSize}
        )
      `) as unknown as QueryResult;
      const count = result.count ?? 0;
      removed += count;
      if (count < this.batchSize) break;
    }
    return removed;
  }

  private async sweepUnclaimed(): Promise<number> {
    let removed = 0;
    for (let batch = 0; batch < this.maxBatchesPerSweep; batch += 1) {
      const result = (await this.database`
        DELETE FROM outbox_events
        WHERE id IN (
          SELECT id FROM outbox_events
          WHERE status IN ('PENDING', 'RETRY', 'PROCESSING')
            AND created_at < now() - make_interval(days => ${this.unclaimedRetentionDays})
          ORDER BY id
          LIMIT ${this.batchSize}
        )
      `) as unknown as QueryResult;
      const count = result.count ?? 0;
      removed += count;
      if (count < this.batchSize) break;
    }
    return removed;
  }
}
