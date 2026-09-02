import { createWriteStream } from "node:fs";
import { mkdtemp, open, rmdir, unlink, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { RequestDomainError } from "@itqanak/requests";
import { UPLOAD_MAGIC_PREFIX_BYTES, UPLOAD_ZIP_TRAILER_BYTES } from "@itqanak/storage";

import {
  assertUploadBytesComplete,
  assertUploadBytesNotExceeded,
  readWithUploadDeadline,
} from "./upload-http";

export interface PreparedUploadBody {
  readonly header: Uint8Array;
  readonly trailer?: Uint8Array;
  readonly stream: Readable;
  readonly cleanup: () => Promise<void>;
}

/**
 * Spools an OOXML body so its bounded ZIP trailer can be inspected before it
 * reaches private storage. Like the direct path, HTTP framing is defined by
 * Content-Length rather than by waiting for a later EOF signal.
 */
export async function spoolUploadBody(
  body: ReadableStream<Uint8Array> | null,
  contentLength: number,
  signal: AbortSignal,
): Promise<PreparedUploadBody> {
  if (body === null) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  const directory = await mkdtemp(join(tmpdir(), "itqanak-upload-"));
  const path = join(directory, "body");
  const reader = body.getReader();
  const header = Buffer.alloc(Math.min(contentLength, UPLOAD_MAGIC_PREFIX_BYTES));
  const tail = Buffer.alloc(Math.min(contentLength, UPLOAD_ZIP_TRAILER_BYTES));
  let headerLength = 0;
  let tailLength = 0;
  let tailPosition = 0;
  let readBytes = 0;
  let sampledBytes = 0;

  const source = Readable.from(
    (async function* () {
      let complete = false;
      try {
        while (readBytes < contentLength) {
          const result = await readWithUploadDeadline(() => reader.read(), signal);
          if (result.done) {
            break;
          }
          const chunk = Buffer.from(result.value);
          readBytes += chunk.length;
          // This detects an overrun carried in the last exposed HTTP chunk.
          // Bytes beyond Content-Length are not part of this request stream and
          // must be rejected by the HTTP parser/proxy framing layer.
          assertUploadBytesNotExceeded(readBytes, contentLength);
          yield chunk;
        }
        assertUploadBytesComplete(readBytes, contentLength);
        complete = true;
      } finally {
        if (!complete) {
          await reader.cancel().catch(() => undefined);
        }
        reader.releaseLock();
      }
    })(),
  );
  const sampler = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      try {
        sampledBytes += chunk.length;
        assertUploadBytesNotExceeded(sampledBytes, contentLength);
        if (headerLength < header.length) {
          const copied = chunk.copy(header, headerLength, 0, header.length - headerLength);
          headerLength += copied;
        }
        if (tail.length > 0) {
          if (chunk.length >= tail.length) {
            chunk.copy(tail, 0, chunk.length - tail.length);
            tailLength = tail.length;
            tailPosition = 0;
          } else {
            const firstLength = Math.min(chunk.length, tail.length - tailPosition);
            chunk.copy(tail, tailPosition, 0, firstLength);
            if (firstLength < chunk.length) {
              chunk.copy(tail, 0, firstLength);
            }
            tailPosition = (tailPosition + chunk.length) % tail.length;
            tailLength = Math.min(tail.length, tailLength + chunk.length);
          }
        }
        callback(null, chunk);
      } catch (error: unknown) {
        callback(error instanceof Error ? error : new RequestDomainError("INVALID_REQUEST"));
      }
    },
  });

  let handle: FileHandle | undefined;
  const cleanup = async (): Promise<void> => {
    await handle?.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    await rmdir(directory).catch(() => undefined);
  };
  try {
    await pipeline(source, sampler, createWriteStream(path, { flags: "wx", mode: 0o600 }), {
      signal,
    });
    assertUploadBytesComplete(sampledBytes, contentLength);
    if (headerLength !== header.length) {
      throw new RequestDomainError("INVALID_REQUEST");
    }
    const trailer =
      tailLength < tail.length
        ? Buffer.from(tail.subarray(0, tailLength))
        : Buffer.concat([tail.subarray(tailPosition), tail.subarray(0, tailPosition)]);
    // Open the spooled body now, before returning it. A lazily-opened
    // createReadStream(path) schedules its fs.open independently; when the
    // upload is rejected (e.g. failed type validation) before the body is ever
    // read, cleanup() unlinks the file and the pending open then surfaces as an
    // uncaught ENOENT. Holding an already-open descriptor keeps the inode alive
    // for the request's lifetime and closes deterministically in cleanup().
    handle = await open(path, "r");
    const stream = handle.createReadStream({ autoClose: false });
    stream.on("error", () => undefined);
    return { header, trailer, stream, cleanup };
  } catch (error: unknown) {
    await cleanup();
    if (signal.aborted) {
      throw new RequestDomainError("UPLOAD_TIMEOUT");
    }
    throw error;
  }
}

/**
 * Samples the magic-byte prefix while preserving a backpressured stream for
 * object storage. Completion is framed by the already validated
 * Content-Length: waiting for an additional EOF read can deadlock when an HTTP
 * adapter keeps the request stream open until the response is produced.
 */
export async function prepareStreamingUploadBody(
  body: ReadableStream<Uint8Array> | null,
  contentLength: number,
  signal: AbortSignal,
): Promise<PreparedUploadBody> {
  if (body === null) {
    throw new RequestDomainError("INVALID_REQUEST");
  }
  const reader = body.getReader();
  const header = Buffer.alloc(Math.min(contentLength, UPLOAD_MAGIC_PREFIX_BYTES));
  const leadingChunks: Buffer[] = [];
  let headerLength = 0;
  let receivedBytes = 0;
  let released = false;
  let cancelPromise: Promise<void> | undefined;
  let stream: Readable | undefined;

  const releaseReader = (): void => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  const cancelReader = async (): Promise<void> => {
    if (released) {
      return;
    }
    cancelPromise ??= (async () => {
      try {
        await reader.cancel();
      } catch {
        // Stream destruction is best effort; the request is already rejected.
      } finally {
        releaseReader();
      }
    })();
    await cancelPromise;
  };
  const onDeadline = (): void => {
    const timeout = new RequestDomainError("UPLOAD_TIMEOUT");
    stream?.destroy(timeout);
    void cancelReader();
  };
  signal.addEventListener("abort", onDeadline, { once: true });

  try {
    while (headerLength < header.length) {
      const result = await readWithUploadDeadline(() => reader.read(), signal);
      if (result.done) {
        break;
      }
      const chunk = Buffer.from(result.value);
      receivedBytes += chunk.length;
      assertUploadBytesNotExceeded(receivedBytes, contentLength);
      leadingChunks.push(chunk);
      headerLength += chunk.copy(header, headerLength, 0, header.length - headerLength);
    }
    if (headerLength !== header.length) {
      throw new RequestDomainError("INVALID_REQUEST");
    }

    const preparedStream = Readable.from(
      (async function* () {
        let complete = false;
        try {
          for (const chunk of leadingChunks) {
            yield chunk;
          }
          while (receivedBytes < contentLength) {
            const result = await readWithUploadDeadline(() => reader.read(), signal);
            if (result.done) {
              break;
            }
            const chunk = Buffer.from(result.value);
            receivedBytes += chunk.length;
            assertUploadBytesNotExceeded(receivedBytes, contentLength);
            yield chunk;
          }
          assertUploadBytesComplete(receivedBytes, contentLength);
          complete = true;
        } finally {
          if (complete) {
            releaseReader();
          } else {
            await cancelReader();
          }
        }
      })(),
    );
    stream = preparedStream;
    return {
      header,
      stream: preparedStream,
      cleanup: async () => {
        signal.removeEventListener("abort", onDeadline);
        preparedStream.destroy();
        await cancelReader();
      },
    };
  } catch (error: unknown) {
    signal.removeEventListener("abort", onDeadline);
    await cancelReader();
    throw error;
  }
}
