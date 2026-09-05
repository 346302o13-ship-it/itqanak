/**
 * A tiny per-device cache of downloaded conversation attachments (IndexedDB).
 *
 * Under Option-B retention the server purges a file's object a day or so after
 * the recipient downloads it. Whoever downloaded it keeps a copy here so they
 * can still reopen it from the chat afterwards. Best-effort only: every call is
 * guarded and resolves to a harmless fallback when IndexedDB is unavailable
 * (private windows, disabled storage, quota).
 */

const DB_NAME = "itqanak-attachments";
const STORE = "files";
const DB_VERSION = 2;
/** Keep this device-local cache from growing without bound: once past this,
 *  the oldest files are evicted after each write. */
const MAX_CACHE_BYTES = 120 * 1024 * 1024;

interface CachedAttachment {
  readonly id: string;
  readonly blob: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly cachedAt: number;
  readonly size: number;
}

function openDb(): Promise<IDBDatabase | undefined> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(undefined);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(undefined);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE)
        ? request.transaction?.objectStore(STORE)
        : db.createObjectStore(STORE, { keyPath: "id" });
      if (store !== undefined && store !== null && !store.indexNames.contains("cachedAt")) {
        store.createIndex("cachedAt", "cachedAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
  });
}

/** Walk newest→oldest by cachedAt; once the running total passes the cap,
 *  delete every remaining (older) record. Streams one record at a time. */
function evictOverflow(db: IDBDatabase): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      let running = 0;
      const cursorRequest = tx.objectStore(STORE).index("cachedAt").openCursor(null, "prev");
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor === null) return;
        const record = cursor.value as CachedAttachment;
        running += typeof record.size === "number" ? record.size : 0;
        if (running > MAX_CACHE_BYTES) cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function cacheAttachment(
  id: string,
  blob: Blob,
  filename: string,
  mimeType: string,
): Promise<void> {
  const db = await openDb();
  if (db === undefined) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
      const record: CachedAttachment = {
        id,
        blob,
        filename,
        mimeType,
        cachedAt: Date.now(),
        size: blob.size,
      };
      tx.objectStore(STORE).put(record);
    });
    await evictOverflow(db);
  } catch {
    // Quota or transaction failure: the file simply is not cached.
  } finally {
    db.close();
  }
}

export async function readCachedAttachment(
  id: string,
): Promise<{ blob: Blob; filename: string; mimeType: string } | undefined> {
  const db = await openDb();
  if (db === undefined) return undefined;
  try {
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const getRequest = tx.objectStore(STORE).get(id);
      getRequest.onsuccess = () => {
        const value = getRequest.result as CachedAttachment | undefined;
        resolve(
          value === undefined
            ? undefined
            : { blob: value.blob, filename: value.filename, mimeType: value.mimeType },
        );
      };
      getRequest.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  } finally {
    db.close();
  }
}

export async function hasCachedAttachment(id: string): Promise<boolean> {
  return (await readCachedAttachment(id)) !== undefined;
}
