import { RequestDomainError } from "@itqanak/requests";

/**
 * Process-local admission control for OOXML uploads that need a temporary
 * seekable copy before their ZIP central directory can be validated.
 */
export class UploadSpoolBudget {
  private reservedBytes = 0;
  private reservations = 0;

  public constructor(
    private readonly maximumBytes: number,
    private readonly maximumReservations = 8,
  ) {
    if (
      !Number.isSafeInteger(maximumBytes) ||
      maximumBytes < 1 ||
      !Number.isSafeInteger(maximumReservations) ||
      maximumReservations < 1
    ) {
      throw new TypeError("Upload spool budget must be a positive safe integer.");
    }
  }

  public reserve(bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 1) {
      throw new RequestDomainError("INVALID_REQUEST");
    }
    if (
      this.reservations >= this.maximumReservations ||
      this.reservedBytes + bytes > this.maximumBytes
    ) {
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }
    this.reservedBytes += bytes;
    this.reservations += 1;
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      this.reservedBytes -= bytes;
      this.reservations -= 1;
    };
  }

  public get usedBytes(): number {
    return this.reservedBytes;
  }

  public get activeReservations(): number {
    return this.reservations;
  }
}

export class UploadConcurrencyBudget {
  private activeUploads = 0;

  public constructor(private readonly maximumUploads: number) {
    if (!Number.isSafeInteger(maximumUploads) || maximumUploads < 1) {
      throw new TypeError("Upload concurrency limit must be a positive safe integer.");
    }
  }

  public reserve(): () => void {
    if (this.activeUploads >= this.maximumUploads) {
      throw new RequestDomainError("STORAGE_UNAVAILABLE");
    }
    this.activeUploads += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.activeUploads -= 1;
      }
    };
  }

  public get active(): number {
    return this.activeUploads;
  }
}

// Production gives /tmp a 64 MiB tmpfs. Two maximum-size full-body-spooled
// files (OOXML documents or plain ZIP archives — anything whose ZIP central
// directory has to be captured) may be admitted concurrently while at least
// 24 MiB remains for runtime overhead.
export const ooxmlUploadSpoolBudget = new UploadSpoolBudget(40 * 1_024 * 1_024);
export const uploadConcurrencyBudget = new UploadConcurrencyBudget(32);
