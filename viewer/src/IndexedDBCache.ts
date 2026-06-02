import { useCallback, useEffect, useRef, useState } from "react";

export interface CachedQuestion {
  id: string;
  data: unknown;
  timestamp: number;
}

const DEFAULT_DB_NAME = "sat-bank-cache";
const STORE_NAME = "questions";
const DB_VERSION = 1;

function isIDBAvailable(): boolean {
  try {
    return (
      typeof indexedDB !== "undefined" && indexedDB !== null
    );
  } catch {
    return false;
  }
}

export function openCache(dbName: string = DEFAULT_DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIDBAvailable()) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(dbName, DB_VERSION);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
      } else {
        const tx = req.transaction;
        if (tx) {
          const store = tx.objectStore(STORE_NAME);
          if (!store.indexNames.contains("timestamp")) {
            store.createIndex("timestamp", "timestamp", { unique: false });
          }
        }
      }
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error("Failed to open IndexedDB"));
    };
    req.onblocked = () => {
      reject(new Error("IndexedDB open blocked"));
    };
  });
}

export function getCached(
  db: IDBDatabase,
  id: string
): Promise<CachedQuestion | null> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);
      req.onsuccess = () => {
        const result = req.result as CachedQuestion | undefined;
        resolve(result ?? null);
      };
      req.onerror = () => {
        reject(req.error ?? new Error("getCached failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export function putCached(
  db: IDBDatabase,
  id: string,
  data: unknown
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const entry: CachedQuestion = {
        id,
        data,
        timestamp: Date.now(),
      };
      const req = store.put(entry);
      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => {
        reject(req.error ?? new Error("putCached failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export function evictOldest(
  db: IDBDatabase,
  keepCount: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();
      countReq.onsuccess = () => {
        const total = countReq.result;
        const toDelete = total - keepCount;
        if (toDelete <= 0) {
          resolve();
          return;
        }
        let deleted = 0;
        const index = store.index("timestamp");
        const cursorReq = index.openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor || deleted >= toDelete) {
            resolve();
            return;
          }
          cursor.delete();
          deleted++;
          cursor.continue();
        };
        cursorReq.onerror = () => {
          reject(cursorReq.error ?? new Error("evictOldest cursor failed"));
        };
      };
      countReq.onerror = () => {
        reject(countReq.error ?? new Error("evictOldest count failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export function clearCache(db: IDBDatabase): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => {
        resolve();
      };
      req.onerror = () => {
        reject(req.error ?? new Error("clearCache failed"));
      };
    } catch (err) {
      reject(err);
    }
  });
}

export interface UseIndexedDBCacheResult {
  ready: boolean;
  get: (id: string) => Promise<unknown | null>;
  put: (id: string, data: unknown) => Promise<void>;
  clear: () => Promise<void>;
}

export function useIndexedDBCache(
  dbName: string = DEFAULT_DB_NAME
): UseIndexedDBCacheResult {
  const dbRef = useRef<IDBDatabase | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!isIDBAvailable()) {
      setReady(false);
      return;
    }
    openCache(dbName)
      .then((db) => {
        if (cancelled) {
          db.close();
          return;
        }
        dbRef.current = db;
        setReady(true);
      })
      .catch((err) => {
        console.warn("IndexedDB cache unavailable:", err);
        setReady(false);
      });
    return () => {
      cancelled = true;
      if (dbRef.current) {
        try {
          dbRef.current.close();
        } catch {
          // ignore
        }
        dbRef.current = null;
      }
    };
  }, [dbName]);

  const get = useCallback(async (id: string): Promise<unknown | null> => {
    const db = dbRef.current;
    if (!db) return null;
    try {
      const entry = await getCached(db, id);
      return entry ? entry.data : null;
    } catch (err) {
      console.warn("IndexedDB get failed:", err);
      return null;
    }
  }, []);

  const put = useCallback(async (id: string, data: unknown): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;
    try {
      await putCached(db, id, data);
    } catch (err) {
      console.warn("IndexedDB put failed:", err);
    }
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    const db = dbRef.current;
    if (!db) return;
    try {
      await clearCache(db);
    } catch (err) {
      console.warn("IndexedDB clear failed:", err);
    }
  }, []);

  return { ready, get, put, clear };
}
