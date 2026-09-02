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
const DB_VERSION = 1;

interface CachedAttachment {
  readonly id: string;
  readonly blob: Blob;
  readonly filename: string;
  readonly mimeType: string;
  readonly cachedAt: number;
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
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
    request.onblocked = () => resolve(undefined);
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
      };
      tx.objectStore(STORE).put(record);
    });
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
