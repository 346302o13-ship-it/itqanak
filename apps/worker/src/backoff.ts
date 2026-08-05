export function nextBackoffDelay(attempt: number, maxDelayMs = 30_000): number {
  const boundedAttempt = Math.max(0, Math.min(attempt, 8));
  const exponential = Math.min(1_000 * 2 ** boundedAttempt, maxDelayMs);
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(exponential * 0.2)));
  return Math.min(exponential + jitter, maxDelayMs);
}

export function waitFor(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timeout = setTimeout(finish, milliseconds);
    const onAbort = (): void => finish();

    function finish(): void {
      clearTimeout(timeout);
      signal.removeEventListener("abort", onAbort);
      resolve();
    }

    signal.addEventListener("abort", onAbort, { once: true });
  });
}
