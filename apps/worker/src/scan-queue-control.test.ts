import { describe, expect, it } from "vitest";

import { shouldProcessAttachmentScans } from "./scan-queue-control.js";

describe("malware scan queue operational control", () => {
  it("claims work only after the host confirms the enabled scanner is running", () => {
    expect(
      shouldProcessAttachmentScans({
        fileScanQueuePaused: false,
        fileScannerObservedState: "RUNNING",
      }),
    ).toBe(true);
    expect(
      shouldProcessAttachmentScans({
        fileScanQueuePaused: false,
        fileScannerObservedState: "STARTING",
      }),
    ).toBe(false);
    expect(
      shouldProcessAttachmentScans({
        fileScanQueuePaused: true,
        fileScannerObservedState: "RUNNING",
      }),
    ).toBe(false);
  });
});
