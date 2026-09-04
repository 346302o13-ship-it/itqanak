import { createHash } from "node:crypto";
import { mkdtemp, rmdir, unlink } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { crc32 } from "node:zlib";

import { S3Client } from "@aws-sdk/client-s3";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ClamAvTcpScanner,
  createMalwareScanner,
  createRequestObjectKey,
  LocalPrivateStorage,
  S3CompatibleStorage,
  StorageValidationError,
  type StorageValidationCode,
  validateUpload,
} from "./index.js";

const temporaryObjects: { root: string; key?: string }[] = [];
const servers: Server[] = [];

function createStoredZip(
  entries: readonly { name: string; content: string }[],
  generalPurposeFlags = 0,
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "ascii");
    const content = Buffer.from(entry.content, "utf8");
    const checksum = crc32(content);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x0403_4b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(generalPurposeFlags, 6);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);
    localParts.push(localHeader, name, content);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x0201_4b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(generalPurposeFlags, 8);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralParts.push(centralHeader, name);
    localOffset += localHeader.length + name.length + content.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x0605_4b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createOoxmlArchive(family: "docx" | "pptx" | "xlsx"): Buffer {
  const roots = {
    docx: "word/document.xml",
    pptx: "ppt/presentation.xml",
    xlsx: "xl/workbook.xml",
  } as const;
  const contentTypes = {
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  } as const;
  const root = roots[family];
  return createStoredZip([
    {
      name: "[Content_Types].xml",
      content: `<Types><Override PartName="/${root}" ContentType="${contentTypes[family]}"/></Types>`,
    },
    { name: "_rels/.rels", content: "<Relationships/>" },
    { name: root, content: "<root/>" },
  ]);
}

function expectStorageValidationCode(
  callback: () => unknown,
  expectedCode: StorageValidationCode,
): void {
  try {
    callback();
    throw new Error("Expected storage validation to fail.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StorageValidationError);
    if (error instanceof StorageValidationError) {
      expect(error.code).toBe(expectedCode);
    }
  }
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
  for (const temporaryObject of temporaryObjects.splice(0)) {
    if (temporaryObject.key !== undefined) {
      const fullPath = join(temporaryObject.root, temporaryObject.key);
      await unlink(fullPath).catch(() => undefined);
      let directory = dirname(fullPath);
      while (directory !== temporaryObject.root) {
        await rmdir(directory).catch(() => undefined);
        directory = dirname(directory);
      }
    }
    await rmdir(temporaryObject.root).catch(() => undefined);
  }
});

describe("upload validation", () => {
  it("accepts a PDF only when extension, declaration, and magic agree", () => {
    const header = Buffer.from("%PDF-1.7 test");
    expect(
      validateUpload({
        filename: "course-work.pdf",
        declaredMimeType: "application/pdf",
        size: header.length,
        maxBytes: 20,
        header,
      }),
    ).toMatchObject({ normalizedExtension: ".pdf", detectedMimeType: "application/pdf" });
  });

  it("accepts browser voice-note formats only when their signatures agree", () => {
    const cases = [
      ["voice.webm", "audio/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x86])],
      ["voice.ogg", "audio/ogg", Buffer.from("OggSvoice")],
      ["voice.mp3", "audio/mpeg", Buffer.from("ID3voice")],
      [
        "voice.wav",
        "audio/wav",
        Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]),
      ],
    ] as const;
    for (const [filename, declaredMimeType, header] of cases) {
      expect(
        validateUpload({
          filename,
          declaredMimeType,
          size: header.length,
          maxBytes: 1_024,
          header,
        }).detectedMimeType,
      ).toBe(declaredMimeType);
    }

    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "voice.webm",
          declaredMimeType: "audio/webm",
          size: 8,
          maxBytes: 1_024,
          header: Buffer.from("not-webm"),
        }),
      "MIME_MISMATCH",
    );
  });

  it("accepts an MP4 video when the ftyp box is present, rejects it otherwise", () => {
    const header = Buffer.from([
      0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(
      validateUpload({
        filename: "clip.mp4",
        declaredMimeType: "video/mp4",
        size: header.length,
        maxBytes: 1_024,
        header,
      }),
    ).toMatchObject({ normalizedExtension: ".mp4", detectedMimeType: "video/mp4" });
    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "clip.mp4",
          declaredMimeType: "video/mp4",
          size: 13,
          maxBytes: 1_024,
          header: Buffer.from("not-an-mp4-at"),
        }),
      "MIME_MISMATCH",
    );
  });

  it("rejects executable extensions, MIME spoofing, path names, and oversized files", () => {
    const header = Buffer.from("%PDF-1.7 test");
    const base = {
      filename: "course-work.pdf",
      declaredMimeType: "application/pdf",
      size: header.length,
      maxBytes: 20,
      header,
    };
    expectStorageValidationCode(
      () => validateUpload({ ...base, filename: "unsafe.exe" }),
      "TYPE_NOT_ALLOWED",
    );
    expectStorageValidationCode(
      () => validateUpload({ ...base, header: Buffer.from("MZ executable") }),
      "MIME_MISMATCH",
    );
    expectStorageValidationCode(
      () => validateUpload({ ...base, filename: "../course-work.pdf" }),
      "INVALID_FILENAME",
    );
    expectStorageValidationCode(() => validateUpload({ ...base, size: 21 }), "FILE_TOO_LARGE");
  });

  it("canonicalizes JPEG and rejects a garbled M4A / still-unsupported archive uploads", () => {
    expect(
      validateUpload({
        filename: "photo.jpeg",
        declaredMimeType: "image/jpeg",
        size: 4,
        maxBytes: 20,
        header: Buffer.from([0xff, 0xd8, 0xff, 0xdb]),
      }).normalizedExtension,
    ).toBe(".jpg");
    // .m4a is a recognized extension now, so bytes that don't match its
    // ISO-BMFF container fail as a content mismatch, not an unknown type.
    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "voice.m4a",
          declaredMimeType: "audio/mp4",
          size: 12,
          maxBytes: 20,
          header: Buffer.from("unsupported!"),
        }),
      "MIME_MISMATCH",
    );
    // Generic .zip stays unsupported — only the OOXML family above (backed by
    // the full central-directory parse) is accepted as a ZIP container.
    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "files.zip",
          declaredMimeType: "application/zip",
          size: 4,
          maxBytes: 20,
          header: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        }),
      "TYPE_NOT_ALLOWED",
    );
  });

  it("accepts the expanded document/image/audio/video family by magic bytes", () => {
    const oleHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    const isoBmffHeader = (brand: string) =>
      Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from(brand, "ascii")]);
    const cases: readonly {
      filename: string;
      declaredMimeType: string;
      header: Buffer;
    }[] = [
      { filename: "old.doc", declaredMimeType: "application/msword", header: oleHeader },
      { filename: "old.xls", declaredMimeType: "application/vnd.ms-excel", header: oleHeader },
      { filename: "old.ppt", declaredMimeType: "application/vnd.ms-powerpoint", header: oleHeader },
      {
        filename: "note.rtf",
        declaredMimeType: "application/rtf",
        header: Buffer.from("{\\rtf1\\ansi"),
      },
      { filename: "grades.csv", declaredMimeType: "text/csv", header: Buffer.from("a,b,c\n1,2,3") },
      {
        filename: "photo.webp",
        declaredMimeType: "image/webp",
        header: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
      },
      {
        filename: "sticker.gif",
        declaredMimeType: "image/gif",
        header: Buffer.from("GIF89a"),
      },
      { filename: "photo.heic", declaredMimeType: "image/heic", header: isoBmffHeader("heic") },
      { filename: "photo.heif", declaredMimeType: "image/heif", header: isoBmffHeader("mif1") },
      { filename: "clip.mov", declaredMimeType: "video/quicktime", header: isoBmffHeader("qt  ") },
      { filename: "clip.3gp", declaredMimeType: "video/3gpp", header: isoBmffHeader("3gp5") },
      { filename: "voice.m4a", declaredMimeType: "audio/mp4", header: isoBmffHeader("M4A ") },
      {
        filename: "voice.aac",
        declaredMimeType: "audio/aac",
        header: Buffer.from([0xff, 0xf1, 0, 0]),
      },
      {
        filename: "voice.amr",
        declaredMimeType: "audio/amr",
        header: Buffer.from("#!AMR\n"),
      },
    ];
    for (const testCase of cases) {
      const result = validateUpload({
        filename: testCase.filename,
        declaredMimeType: testCase.declaredMimeType,
        size: testCase.header.length,
        maxBytes: 1024,
        header: testCase.header,
      });
      expect(result.declaredMimeType).toBe(testCase.declaredMimeType);
    }
  });

  it("rejects a HEIC-extension file whose ISO-BMFF brand is not a HEIC/HEIF brand", () => {
    const mp4Header = Buffer.concat([Buffer.alloc(4), Buffer.from("ftyp"), Buffer.from("isom")]);
    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "clip.heic",
          declaredMimeType: "image/heic",
          size: mp4Header.length,
          maxBytes: 1024,
          header: mp4Header,
        }),
      "MIME_MISMATCH",
    );
  });

  it("rejects binary data declared as UTF-8 text", () => {
    expect(() =>
      validateUpload({
        filename: "notes.txt",
        declaredMimeType: "text/plain",
        size: 4,
        maxBytes: 20,
        header: Buffer.from([0x61, 0x00, 0x62, 0x63]),
      }),
    ).toThrow(StorageValidationError);
  });

  it("distinguishes OOXML document, presentation, and spreadsheet packages", () => {
    const cases = [
      ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
      ["pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
      ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    ] as const;
    for (const [extension, declaredMimeType] of cases) {
      const archive = createOoxmlArchive(extension);
      expect(
        validateUpload({
          filename: `course-work.${extension}`,
          declaredMimeType,
          size: archive.length,
          maxBytes: 4_096,
          header: archive,
          trailer: archive,
        }).normalizedExtension,
      ).toBe(`.${extension}`);
    }

    const pptx = createOoxmlArchive("pptx");
    expectStorageValidationCode(
      () =>
        validateUpload({
          filename: "course-work.docx",
          declaredMimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          size: pptx.length,
          maxBytes: 4_096,
          header: pptx,
          trailer: pptx,
        }),
      "MIME_MISMATCH",
    );
  });

  it("accepts a DOCX whose entries carry DEFLATE compression-level flag bits", () => {
    // Real Word / LibreOffice output sets bits 1-2 (compression level) on
    // deflated entries; those are informational and must not fail validation.
    const archive = createStoredZip(
      [
        {
          name: "[Content_Types].xml",
          content:
            '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        },
        { name: "_rels/.rels", content: "<Relationships/>" },
        { name: "word/document.xml", content: "<root/>" },
      ],
      0x0006,
    );
    expect(
      validateUpload({
        filename: "course-work.docx",
        declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        size: archive.length,
        maxBytes: 4_096,
        header: archive,
        trailer: archive,
      }).normalizedExtension,
    ).toBe(".docx");
  });

  it("rejects a synthetic ZIP substring and unsafe central-directory paths", () => {
    const fake = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("word/document.xml [Content_Types].xml", "ascii"),
    ]);
    const unsafe = createStoredZip([
      {
        name: "[Content_Types].xml",
        content:
          '<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      },
      { name: "_rels/.rels", content: "<Relationships/>" },
      { name: "word/document.xml", content: "<root/>" },
      { name: "../outside", content: "unsafe" },
    ]);
    for (const archive of [fake, unsafe]) {
      expectStorageValidationCode(
        () =>
          validateUpload({
            filename: "course-work.docx",
            declaredMimeType:
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            size: archive.length,
            maxBytes: 4_096,
            header: archive,
            trailer: archive,
          }),
        "MIME_MISMATCH",
      );
    }
  });
});

describe("private object storage", () => {
  it("creates opaque request-scoped keys without using a filename", () => {
    const requestId = "991b34a1-f3e1-4b01-82de-1d445317d19e";
    const attachmentId = "4bf5c278-8140-418d-a97f-18e659f42897";
    const first = createRequestObjectKey(requestId, attachmentId);
    const second = createRequestObjectKey(requestId, attachmentId);
    expect(first).toMatch(
      /^requests\/991b34a1-f3e1-4b01-82de-1d445317d19e\/4bf5c278-8140-418d-a97f-18e659f42897\/[a-f0-9]{32}$/,
    );
    expect(first).not.toEqual(second);
  });

  it("streams a private local object while calculating SHA-256", async () => {
    const root = await mkdtemp(join(tmpdir(), "itqanak-storage-"));
    const storage = new LocalPrivateStorage(root);
    const content = Buffer.from("streamed private course work", "utf8");
    const key = createRequestObjectKey(
      "991b34a1-f3e1-4b01-82de-1d445317d19e",
      "4bf5c278-8140-418d-a97f-18e659f42897",
    );
    temporaryObjects.push({ root, key });
    const stored = await storage.put(
      key,
      Readable.from([content.subarray(0, 8), content.subarray(8)]),
      {
        originalName: "course-work.txt",
        declaredMimeType: "text/plain",
        detectedMimeType: "text/plain",
        contentLength: content.length,
        uploadedAt: new Date("2026-08-08T00:00:00.000Z"),
      },
    );

    expect(stored.checksumSha256).toBe(createHash("sha256").update(content).digest("hex"));
    expect(await storage.exists(key)).toBe(true);
    const chunks: Buffer[] = [];
    for await (const chunk of await storage.open(key)) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks)).toEqual(content);
    await storage.remove(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("removes a partial local object when the stream length does not match", async () => {
    const root = await mkdtemp(join(tmpdir(), "itqanak-storage-"));
    const storage = new LocalPrivateStorage(root);
    const key = createRequestObjectKey(
      "991b34a1-f3e1-4b01-82de-1d445317d19e",
      "4bf5c278-8140-418d-a97f-18e659f42897",
    );
    temporaryObjects.push({ root, key });
    await expect(
      storage.put(key, Buffer.from("short"), {
        originalName: "course-work.txt",
        declaredMimeType: "text/plain",
        detectedMimeType: "text/plain",
        contentLength: 20,
        uploadedAt: new Date("2026-08-08T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({ code: "INVALID_LENGTH" });
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.remove(key)).resolves.toBeUndefined();
  });

  it("treats only S3 not-found as missing and propagates authorization failures", async () => {
    const client = new S3Client({
      region: "test-region-1",
      credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" },
    });
    const send = vi.spyOn(client, "send");
    const storage = new S3CompatibleStorage({ bucket: "itqanak-private", client });
    const key = createRequestObjectKey(
      "991b34a1-f3e1-4b01-82de-1d445317d19e",
      "4bf5c278-8140-418d-a97f-18e659f42897",
    );
    send.mockRejectedValueOnce(
      Object.assign(new Error("not found"), { $metadata: { httpStatusCode: 404 } }),
    );
    await expect(storage.exists(key)).resolves.toBe(false);
    const requestOptions = send.mock.calls[0]?.[1];
    expect(requestOptions?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(requestOptions?.abortSignal?.aborted).toBe(false);
    send.mockRejectedValueOnce(
      Object.assign(new Error("forbidden"), { $metadata: { httpStatusCode: 403 } }),
    );
    await expect(storage.exists(key)).rejects.toThrow("forbidden");
    client.destroy();
  });

  it("keeps every S3 operation timeout below the pending-upload reconciliation lease", () => {
    const client = new S3Client({
      region: "test-region-1",
      credentials: { accessKeyId: "test-access", secretAccessKey: "test-secret" },
    });
    expect(
      () =>
        new S3CompatibleStorage({
          bucket: "itqanak-private",
          client,
          operationTimeoutMs: 30 * 60_000 + 1,
        }),
    ).toThrowError(expect.objectContaining({ code: "STORAGE_CONFIGURATION_INVALID" }));
    expect(
      () =>
        new S3CompatibleStorage({
          bucket: "itqanak-private",
          client,
          readOperationTimeoutMs: 2 * 60_000 + 1,
        }),
    ).toThrowError(expect.objectContaining({ code: "STORAGE_CONFIGURATION_INVALID" }));
    client.destroy();
  });
});

async function startFakeClamAv(response: "clean" | "infected"): Promise<number> {
  const server = createServer((socket) => {
    let buffered = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      buffered = Buffer.concat([buffered, chunk]);
      if (buffered.subarray(0, 6).toString("ascii") === "zPING\0") {
        socket.end("PONG\0");
        return;
      }
      const commandLength = Buffer.byteLength("zINSTREAM\0");
      if (
        buffered.length < commandLength ||
        buffered.subarray(0, commandLength).toString("ascii") !== "zINSTREAM\0"
      ) {
        return;
      }
      let offset = commandLength;
      while (buffered.length >= offset + 4) {
        const frameLength = buffered.readUInt32BE(offset);
        if (frameLength === 0) {
          socket.end(response === "clean" ? "stream: OK\0" : "stream: Unit-Test-Signature FOUND\0");
          return;
        }
        if (buffered.length < offset + 4 + frameLength) {
          return;
        }
        offset += 4 + frameLength;
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Fake scanner did not bind to a TCP port.");
  }
  return address.port;
}

describe("malware scanner", () => {
  it("uses an explicit skipped result when development scanning is disabled", async () => {
    const scanner = createMalwareScanner({
      mode: "disabled",
      clamavHost: "clamav",
      clamavPort: 3310,
      connectTimeoutMs: 100,
      scanTimeoutMs: 100,
      maxAttempts: 5,
    });
    expect(await scanner.scan(Readable.from(["not scanned"]))).toEqual({
      status: "SKIPPED_DEVELOPMENT",
    });
    expect(await scanner.checkReadiness()).toBe("disabled-development");
  });

  it.each([
    ["clean", "CLEAN"],
    ["infected", "INFECTED"],
  ] as const)("maps a ClamAV %s response", async (response, expectedStatus) => {
    const port = await startFakeClamAv(response);
    const scanner = new ClamAvTcpScanner({
      host: "127.0.0.1",
      port,
      connectTimeoutMs: 500,
      scanTimeoutMs: 500,
    });
    expect(await scanner.checkReadiness()).toBe("healthy");
    expect(await scanner.scan(Readable.from(["unit test payload"]))).toEqual({
      status: expectedStatus,
    });
  });

  it("returns safe error/readiness states when ClamAV is unavailable", async () => {
    const scanner = new ClamAvTcpScanner({
      host: "127.0.0.1",
      port: 1,
      connectTimeoutMs: 50,
      scanTimeoutMs: 50,
    });
    expect(await scanner.checkReadiness()).toBe("unavailable");
    expect(await scanner.scan(Readable.from(["unit test payload"]))).toEqual({ status: "ERROR" });
  });

  it("distinguishes an object input-stream failure from a scanner failure", async () => {
    const port = await startFakeClamAv("clean");
    const scanner = new ClamAvTcpScanner({
      host: "127.0.0.1",
      port,
      connectTimeoutMs: 500,
      scanTimeoutMs: 500,
    });
    const input = new Readable({
      read() {
        this.push(Buffer.from("partial object"));
        this.destroy(new Error("simulated object stream failure"));
      },
    });

    expect(await scanner.scan(input)).toEqual({
      status: "ERROR",
      errorSource: "INPUT_STREAM",
    });
  });
});
