import type { Logger } from "@itqanak/observability";

/**
 * Deliberate phase-one seam: future processors claim an outbox row, perform a
 * side effect, then atomically mark delivery/retry. It performs no network
 * notification until the notification phase is explicitly implemented.
 */
export interface OutboxWorkLoop {
  poll(): Promise<void>;
}

export class DeferredOutboxWorkLoop implements OutboxWorkLoop {
  public constructor(private readonly logger: Logger) {}

  public async poll(): Promise<void> {
    this.logger.debug("outbox_poll_deferred");
  }
}
