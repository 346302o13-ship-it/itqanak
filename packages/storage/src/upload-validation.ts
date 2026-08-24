import { basename, extname } from "node:path";
import { TextDecoder } from "node:util";
import { crc32, inflateRawSync } from "node:zlib";

export const UPLOAD_MAGIC_PREFIX_BYTES = 65_536;
export const UPLOAD_ZIP_TRAILER_BYTES = 1_114_133;

const MAX_ZIP_ENTRIES = 512;
const MAX_ZIP_CENTRAL_DIRECTORY_BYTES = 1_048_576;
const MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES = 100 * 1_024 * 1_024;
const MAX_CONTENT_TYPES_BYTES = 1_048_576;

export const allowedUploadMimeTypes = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/wav",
] as const;

export type AllowedUploadMimeType = (typeof allowedUploadMimeTypes)[number];

export type ValidatedUpload = Readonly<{
  originalFilename: string;
  normalizedExtension:
    | ".pdf"
    | ".docx"
    | ".pptx"
    | ".xlsx"
    | ".txt"
    | ".png"
    | ".jpg"
    | ".webm"
    | ".ogg"
    | ".mp3"
    | ".wav";
  declaredMimeType: AllowedUploadMimeType;
  detectedMimeType: AllowedUploadMimeType;
  size: number;
}>;

export type UploadValidationInput = Readonly<{
  filename: string;
  declaredMimeType: string;
  size: number;
  /** Exact leading bytes, bounded by UPLOAD_MAGIC_PREFIX_BYTES. */
  header: Uint8Array;
  /** Exact trailing bytes for bounded ZIP central-directory inspection. */
  trailer?: Uint8Array;
  maxBytes: number;
}>;

type OoxmlFamily = "docx" | "pptx" | "xlsx";

type FilePolicy = Readonly<{
  normalizedExtension: ValidatedUpload["normalizedExtension"];
  declaredMimeType: AllowedUploadMimeType;
  detectedMimeType: AllowedUploadMimeType;
  matchesMagic?: (header: Uint8Array) => boolean;
  ooxmlFamily?: OoxmlFamily;
}>;

const startsWith = (header: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => header[index] === byte);

const isUtf8Text = (header: Uint8Array): boolean => {
  if (header.length === 0 || header.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(header);
    return true;
  } catch {
    return false;
  }
};

type ZipEntry = Readonly<{
  name: string;
  flags: number;
  compressionMethod: number;
  checksumCrc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}>;

const familyRootParts: Readonly<Record<OoxmlFamily, string>> = {
  docx: "word/document.xml",
  pptx: "ppt/presentation.xml",
  xlsx: "xl/workbook.xml",
};

const familyContentTypes: Readonly<Record<OoxmlFamily, string>> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
};

function findEndOfCentralDirectory(trailer: Buffer): number | undefined {
  const minimumOffset = Math.max(0, trailer.length - 65_557);
  for (let offset = trailer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (trailer.readUInt32LE(offset) !== 0x0605_4b50) {
      continue;
    }
    const commentLength = trailer.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === trailer.length) {
      return offset;
    }
  }
  return undefined;
}

function safeZipEntryName(bytes: Buffer): string | undefined {
  if (bytes.length < 1 || bytes.some((byte) => byte < 0x20 || byte > 0x7e)) {
    return undefined;
  }
  const name = bytes.toString("ascii");
  if (name.startsWith("/") || name.includes("\\") || name.includes(":")) {
    return undefined;
  }
  const segments = name.split("/");
  const lastIndex = segments.length - 1;
  if (
    segments.some(
      (segment, index) =>
        segment === "." || segment === ".." || (segment.length === 0 && index !== lastIndex),
    )
  ) {
    return undefined;
  }
  return name;
}

function hasValidNonZip64ExtraFields(extra: Buffer): boolean {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) {
      return false;
    }
    const identifier = extra.readUInt16LE(cursor);
    const size = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (identifier === 0x0001 || cursor + size > extra.length) {
      return false;
    }
    cursor += size;
  }
  return cursor === extra.length;
}

function parseCentralDirectory(
  fileSize: number,
  suppliedTrailer: Uint8Array,
): readonly ZipEntry[] | undefined {
  if (suppliedTrailer.length < 22 || suppliedTrailer.length > fileSize) {
    return undefined;
  }
  const trailerBytes = suppliedTrailer.subarray(
    Math.max(0, suppliedTrailer.length - UPLOAD_ZIP_TRAILER_BYTES),
  );
  const trailer = Buffer.from(trailerBytes);
  const trailerStart = fileSize - trailer.length;
  const endOffset = findEndOfCentralDirectory(trailer);
  if (endOffset === undefined) {
    return undefined;
  }

  const diskNumber = trailer.readUInt16LE(endOffset + 4);
  const centralDirectoryDisk = trailer.readUInt16LE(endOffset + 6);
  const entriesOnDisk = trailer.readUInt16LE(endOffset + 8);
  const entryCount = trailer.readUInt16LE(endOffset + 10);
  const centralDirectorySize = trailer.readUInt32LE(endOffset + 12);
  const centralDirectoryOffset = trailer.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount < 1 ||
    entryCount > MAX_ZIP_ENTRIES ||
    entryCount === 0xffff ||
    centralDirectorySize > MAX_ZIP_CENTRAL_DIRECTORY_BYTES ||
    centralDirectorySize === 0xffff_ffff ||
    centralDirectoryOffset === 0xffff_ffff ||
    centralDirectoryOffset + centralDirectorySize !== trailerStart + endOffset
  ) {
    return undefined;
  }

  const centralStart = centralDirectoryOffset - trailerStart;
  const centralEnd = centralStart + centralDirectorySize;
  if (centralStart < 0 || centralEnd > endOffset) {
    return undefined;
  }

  const entries: ZipEntry[] = [];
  const normalizedNames = new Set<string>();
  let totalCompressedBytes = 0;
  let totalUncompressedBytes = 0;
  let cursor = centralStart;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > centralEnd || trailer.readUInt32LE(cursor) !== 0x0201_4b50) {
      return undefined;
    }
    const versionMadeBy = trailer.readUInt16LE(cursor + 4);
    const flags = trailer.readUInt16LE(cursor + 8);
    const compressionMethod = trailer.readUInt16LE(cursor + 10);
    const checksumCrc32 = trailer.readUInt32LE(cursor + 16);
    const compressedSize = trailer.readUInt32LE(cursor + 20);
    const uncompressedSize = trailer.readUInt32LE(cursor + 24);
    const filenameLength = trailer.readUInt16LE(cursor + 28);
    const extraLength = trailer.readUInt16LE(cursor + 30);
    const commentLength = trailer.readUInt16LE(cursor + 32);
    const diskStart = trailer.readUInt16LE(cursor + 34);
    const externalAttributes = trailer.readUInt32LE(cursor + 38);
    const localHeaderOffset = trailer.readUInt32LE(cursor + 42);
    const entryEnd = cursor + 46 + filenameLength + extraLength + commentLength;
    if (
      entryEnd > centralEnd ||
      (flags & ~(0x0008 | 0x0800)) !== 0 ||
      (compressionMethod !== 0 && compressionMethod !== 8) ||
      compressedSize === 0xffff_ffff ||
      uncompressedSize === 0xffff_ffff ||
      localHeaderOffset === 0xffff_ffff ||
      localHeaderOffset >= centralDirectoryOffset ||
      diskStart !== 0
    ) {
      return undefined;
    }
    const unixMode = externalAttributes >>> 16;
    if (versionMadeBy >>> 8 === 3 && (unixMode & 0o170000) === 0o120000) {
      return undefined;
    }
    const name = safeZipEntryName(trailer.subarray(cursor + 46, cursor + 46 + filenameLength));
    const extra = trailer.subarray(
      cursor + 46 + filenameLength,
      cursor + 46 + filenameLength + extraLength,
    );
    if (
      name === undefined ||
      normalizedNames.has(name.toLowerCase()) ||
      !hasValidNonZip64ExtraFields(extra)
    ) {
      return undefined;
    }
    normalizedNames.add(name.toLowerCase());
    totalCompressedBytes += compressedSize;
    totalUncompressedBytes += uncompressedSize;
    if (
      !Number.isSafeInteger(totalCompressedBytes) ||
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalCompressedBytes > fileSize ||
      totalUncompressedBytes > MAX_ZIP_TOTAL_UNCOMPRESSED_BYTES
    ) {
      return undefined;
    }
    entries.push({
      name,
      flags,
      compressionMethod,
      checksumCrc32,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = entryEnd;
  }
  const expansionAllowance = Math.max(totalCompressedBytes * 200, 1_048_576);
  return cursor === centralEnd && totalUncompressedBytes <= expansionAllowance
    ? entries
    : undefined;
}

function readBoundedZipEntry(entry: ZipEntry, prefix: Buffer): Buffer | undefined {
  if (
    entry.uncompressedSize > MAX_CONTENT_TYPES_BYTES ||
    entry.localHeaderOffset + 30 > prefix.length ||
    prefix.readUInt32LE(entry.localHeaderOffset) !== 0x0403_4b50
  ) {
    return undefined;
  }
  const localFlags = prefix.readUInt16LE(entry.localHeaderOffset + 6);
  const localMethod = prefix.readUInt16LE(entry.localHeaderOffset + 8);
  const filenameLength = prefix.readUInt16LE(entry.localHeaderOffset + 26);
  const extraLength = prefix.readUInt16LE(entry.localHeaderOffset + 28);
  const filenameStart = entry.localHeaderOffset + 30;
  const extraStart = filenameStart + filenameLength;
  const dataStart = filenameStart + filenameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (
    (localFlags & ~(0x0008 | 0x0800)) !== 0 ||
    localFlags !== entry.flags ||
    localMethod !== entry.compressionMethod ||
    dataEnd > prefix.length ||
    !hasValidNonZip64ExtraFields(prefix.subarray(extraStart, dataStart)) ||
    prefix.subarray(filenameStart, filenameStart + filenameLength).toString("ascii") !== entry.name
  ) {
    return undefined;
  }
  try {
    const compressed = prefix.subarray(dataStart, dataEnd);
    const content =
      entry.compressionMethod === 0
        ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: MAX_CONTENT_TYPES_BYTES });
    if (content.length !== entry.uncompressedSize || crc32(content) !== entry.checksumCrc32) {
      return undefined;
    }
    return content;
  } catch {
    return undefined;
  }
}

function contentTypesDeclareFamily(xml: string, family: OoxmlFamily): boolean {
  const expectedPartName = `/${familyRootParts[family]}`;
  const expectedContentType = familyContentTypes[family];
  for (const match of xml.matchAll(/<Override\b([^>]*)\/?\s*>/giu)) {
    const attributes = new Map<string, string>();
    for (const attribute of (match[1] ?? "").matchAll(
      /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/gu,
    )) {
      attributes.set((attribute[1] ?? "").toLowerCase(), attribute[3] ?? "");
    }
    if (
      attributes.get("partname") === expectedPartName &&
      attributes.get("contenttype") === expectedContentType
    ) {
      return true;
    }
  }
  return false;
}

function isOoxmlPackage(input: UploadValidationInput, family: OoxmlFamily): boolean {
  const prefix = Buffer.from(input.header.subarray(0, UPLOAD_MAGIC_PREFIX_BYTES));
  if (!startsWith(prefix, [0x50, 0x4b, 0x03, 0x04])) {
    return false;
  }
  const suppliedTrailer =
    input.trailer ??
    (input.size <= input.header.length ? input.header.subarray(0, input.size) : undefined);
  if (suppliedTrailer === undefined) {
    return false;
  }
  const entries = parseCentralDirectory(input.size, suppliedTrailer);
  if (entries === undefined) {
    return false;
  }
  const names = new Set(entries.map((entry) => entry.name));
  const rootFamilies = (Object.entries(familyRootParts) as [OoxmlFamily, string][]).filter(
    ([, rootPart]) => names.has(rootPart),
  );
  if (
    rootFamilies.length !== 1 ||
    rootFamilies[0]?.[0] !== family ||
    !names.has("_rels/.rels") ||
    entries.some((entry) => entry.name.toLowerCase().endsWith("/vbaproject.bin"))
  ) {
    return false;
  }
  const contentTypesEntry = entries.find((entry) => entry.name === "[Content_Types].xml");
  if (contentTypesEntry === undefined) {
    return false;
  }
  const contentTypes = readBoundedZipEntry(contentTypesEntry, prefix);
  if (contentTypes === undefined) {
    return false;
  }
  try {
    return contentTypesDeclareFamily(
      new TextDecoder("utf-8", { fatal: true }).decode(contentTypes),
      family,
    );
  } catch {
    return false;
  }
}

const policies: Readonly<Record<string, FilePolicy>> = {
  ".pdf": {
    normalizedExtension: ".pdf",
    declaredMimeType: "application/pdf",
    detectedMimeType: "application/pdf",
    matchesMagic: (header) => startsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d]),
  },
  ".docx": {
    normalizedExtension: ".docx",
    declaredMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    detectedMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ooxmlFamily: "docx",
  },
  ".pptx": {
    normalizedExtension: ".pptx",
    declaredMimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    detectedMimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ooxmlFamily: "pptx",
  },
  ".xlsx": {
    normalizedExtension: ".xlsx",
    declaredMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    detectedMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ooxmlFamily: "xlsx",
  },
  ".txt": {
    normalizedExtension: ".txt",
    declaredMimeType: "text/plain",
    detectedMimeType: "text/plain",
    matchesMagic: isUtf8Text,
  },
  ".png": {
    normalizedExtension: ".png",
    declaredMimeType: "image/png",
    detectedMimeType: "image/png",
    matchesMagic: (header) => startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  ".jpg": {
    normalizedExtension: ".jpg",
    declaredMimeType: "image/jpeg",
    detectedMimeType: "image/jpeg",
    matchesMagic: (header) => startsWith(header, [0xff, 0xd8, 0xff]),
  },
  ".jpeg": {
    normalizedExtension: ".jpg",
    declaredMimeType: "image/jpeg",
    detectedMimeType: "image/jpeg",
    matchesMagic: (header) => startsWith(header, [0xff, 0xd8, 0xff]),
  },
  ".webm": {
    normalizedExtension: ".webm",
    declaredMimeType: "audio/webm",
    detectedMimeType: "audio/webm",
    matchesMagic: (header) => startsWith(header, [0x1a, 0x45, 0xdf, 0xa3]),
  },
  ".ogg": {
    normalizedExtension: ".ogg",
    declaredMimeType: "audio/ogg",
    detectedMimeType: "audio/ogg",
    matchesMagic: (header) => startsWith(header, [0x4f, 0x67, 0x67, 0x53]),
  },
  ".mp3": {
    normalizedExtension: ".mp3",
    declaredMimeType: "audio/mpeg",
    detectedMimeType: "audio/mpeg",
    matchesMagic: (header) =>
      startsWith(header, [0x49, 0x44, 0x33]) ||
      (header[0] === 0xff && header[1] !== undefined && (header[1] & 0xe0) === 0xe0),
  },
  ".wav": {
    normalizedExtension: ".wav",
    declaredMimeType: "audio/wav",
    detectedMimeType: "audio/wav",
    matchesMagic: (header) =>
      startsWith(header, [0x52, 0x49, 0x46, 0x46]) &&
      header[8] === 0x57 &&
      header[9] === 0x41 &&
      header[10] === 0x56 &&
      header[11] === 0x45,
  },
};

export const ALLOWED_UPLOAD_MIME_TYPES = new Set<string>(allowedUploadMimeTypes);
export const ALLOWED_UPLOAD_EXTENSIONS = new Set<string>(Object.keys(policies));

export type StorageValidationCode =
  | "INVALID_FILENAME"
  | "FILE_TOO_LARGE"
  | "TYPE_NOT_ALLOWED"
  | "MIME_MISMATCH"
  | "INVALID_KEY"
  | "INVALID_LENGTH"
  | "STORAGE_CONFIGURATION_INVALID"
  | "OBJECT_NOT_READABLE"
  | "SIGNING_UNAVAILABLE"
  | "DOWNLOAD_POLICY_INVALID";

export class StorageValidationError extends Error {
  public constructor(
    public readonly code: StorageValidationCode,
    message: string,
  ) {
    super(message);
    this.name = "StorageValidationError";
  }
}

export function normalizeOriginalFilename(filename: string): string {
  const normalized = filename.normalize("NFKC").trim();
  if (
    normalized.length < 1 ||
    normalized.length > 255 ||
    normalized !== basename(normalized) ||
    normalized.includes("\\") ||
    [...normalized].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127;
    })
  ) {
    throw new StorageValidationError("INVALID_FILENAME", "The original filename is invalid.");
  }
  return normalized;
}

/** Validates size, safe name, extension, declared MIME, and detected magic together. */
export function validateUpload(input: UploadValidationInput): ValidatedUpload {
  const originalFilename = normalizeOriginalFilename(input.filename);
  if (
    !Number.isSafeInteger(input.size) ||
    input.size < 1 ||
    !Number.isSafeInteger(input.maxBytes) ||
    input.maxBytes < 1 ||
    input.size > input.maxBytes
  ) {
    throw new StorageValidationError(
      "FILE_TOO_LARGE",
      "The file size is outside the permitted range.",
    );
  }

  const extension = extname(originalFilename).toLowerCase();
  const policy = policies[extension];
  if (policy === undefined) {
    throw new StorageValidationError("TYPE_NOT_ALLOWED", "The file extension is not allowed.");
  }
  if (input.declaredMimeType.trim().toLowerCase() !== policy.declaredMimeType) {
    throw new StorageValidationError(
      "MIME_MISMATCH",
      "The declared MIME type does not match the extension.",
    );
  }
  if (
    input.header.length < 1 ||
    input.header.length > input.size ||
    (input.trailer !== undefined && (input.trailer.length < 1 || input.trailer.length > input.size))
  ) {
    throw new StorageValidationError("MIME_MISMATCH", "The file samples are invalid.");
  }
  const matchesDetectedType =
    policy.ooxmlFamily === undefined
      ? (policy.matchesMagic?.(input.header.subarray(0, UPLOAD_MAGIC_PREFIX_BYTES)) ?? false)
      : isOoxmlPackage(input, policy.ooxmlFamily);
  if (!matchesDetectedType) {
    throw new StorageValidationError(
      "MIME_MISMATCH",
      "The detected file type does not match the upload metadata.",
    );
  }

  return {
    originalFilename,
    normalizedExtension: policy.normalizedExtension,
    declaredMimeType: policy.declaredMimeType,
    detectedMimeType: policy.detectedMimeType,
    size: input.size,
  };
}

/** Compatibility wrapper that still requires detected bytes; metadata alone is insufficient. */
export function assertAllowedUpload(
  filename: string,
  declaredMimeType: string,
  size: number,
  maxBytes: number,
  header: Uint8Array,
): void {
  validateUpload({ filename, declaredMimeType, size, maxBytes, header });
}
