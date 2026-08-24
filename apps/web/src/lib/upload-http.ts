import { RequestDomainError } from "@itqanak/requests";

export const UPLOAD_BODY_DEADLINE_MS = 5 * 60_000;

export interface UploadDeadline {
  readonly signal: AbortSignal;
  close(): void;
}

export function createUploadDeadline(milliseconds = UPLOAD_BODY_DEADLINE_MS): UploadDeadline {
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 1) {
    throw new TypeError("Upload deadline must be a positive safe integer.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new RequestDomainError("UPLOAD_TIMEOUT"));
  }, milliseconds);
  let closed = false;
  return {
    signal: controller.signal,
    close: () => {
      if (!closed) {
        closed = true;
        clearTimeout(timer);
      }
    },
  };
}

export async function readWithUploadDeadline<T>(
  read: () => Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw new RequestDomainError("UPLOAD_TIMEOUT");
  }
  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener("abort", onAbort);
      callback();
    };
    const onAbort = (): void => {
      finish(() => reject(new RequestDomainError("UPLOAD_TIMEOUT")));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void read().then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function validByteCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function parseUploadContentLength(value: string | null, maximumBytes: number): number {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new TypeError("Upload maximum must be a positive safe integer.");
  }
  if (value === null || !/^\d{1,16}$/u.test(value)) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength < 1) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  if (contentLength > maximumBytes) {
    throw new RequestDomainError("FILE_TOO_LARGE");
  }
  return contentLength;
}

export function assertUploadBytesNotExceeded(receivedBytes: number, declaredBytes: number): void {
  if (
    !validByteCount(receivedBytes) ||
    !validByteCount(declaredBytes) ||
    receivedBytes > declaredBytes
  ) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
}

export function assertUploadBytesComplete(receivedBytes: number, declaredBytes: number): void {
  assertUploadBytesNotExceeded(receivedBytes, declaredBytes);
  if (receivedBytes !== declaredBytes) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
}
