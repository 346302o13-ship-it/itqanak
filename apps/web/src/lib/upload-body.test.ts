import type { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createUploadDeadline } from "./upload-http";
import { prepareStreamingUploadBody, spoolUploadBody } from "./upload-body";

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe("streaming upload body preparation", () => {
  it("completes at the declared length without waiting for a later EOF read", async () => {
    const payload = Buffer.from("ITQANAK bounded upload body.\n", "utf8");
    let sourceController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
        controller.enqueue(payload);
        // Deliberately keep the source open. Some HTTP adapters do not expose
        // EOF until the application starts producing its response.
      },
    });
    const deadline = createUploadDeadline(5_000);

    const prepared = await prepareStreamingUploadBody(body, payload.length, deadline.signal);
    const consumed = await Promise.race([
      readAll(prepared.stream),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("Prepared body waited for EOF.")), 250);
      }),
    ]);

    expect(consumed).toEqual(payload);
    expect(Buffer.from(prepared.header)).toEqual(payload);
    await prepared.cleanup();
    deadline.close();
    sourceController?.close();
  });

  it("spools the declared OOXML length without waiting for a later EOF read", async () => {
    const payload = Buffer.from("PK\u0003\u0004ITQANAK bounded OOXML body.", "utf8");
    let sourceController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
        controller.enqueue(payload.subarray(0, 7));
        controller.enqueue(payload.subarray(7));
        // Deliberately remain open after exactly Content-Length bytes.
      },
    });
    const deadline = createUploadDeadline(1_000);

    const prepared = await spoolUploadBody(body, payload.length, deadline.signal);
    try {
      expect(await readAll(prepared.stream)).toEqual(payload);
      expect(Buffer.from(prepared.header)).toEqual(payload);
      expect(Buffer.from(prepared.trailer ?? [])).toEqual(payload);
    } finally {
      await prepared.cleanup();
      deadline.close();
      sourceController?.close();
    }
  });

  it("rejects an OOXML chunk that overruns the declared length", async () => {
    const payload = Buffer.from("PK\u0003\u0004too-long", "utf8");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(payload);
        controller.close();
      },
    });
    const deadline = createUploadDeadline(1_000);

    try {
      await expect(
        spoolUploadBody(body, payload.length - 1, deadline.signal),
      ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    } finally {
      deadline.close();
    }
  });
});
