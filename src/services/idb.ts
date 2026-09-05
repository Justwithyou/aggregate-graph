/**
 * IndexedDB 极简封装（KV 存储）。
 * 用于承载超过 localStorage 舒适区的大对象（如包含大量元素的 Excalidraw 场景、
 * 体积膨胀的 draw.io XML），避免 localStorage 约 5MB 配额被单个图表打满。
 */

const DB_NAME = 'drawhub';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('当前环境不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'));
  }).catch((err) => {
    // 打开失败时重置缓存，允许后续重试
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const request = run(transaction.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB 操作失败'));
      }),
  );
}

export const idb = {
  get<T>(key: string): Promise<T | null> {
    return tx<T | undefined>('readonly', (store) => store.get(key) as IDBRequest<T | undefined>).then(
      (value) => (value === undefined ? null : value),
    );
  },

  set(key: string, value: unknown): Promise<void> {
    return tx('readwrite', (store) => store.put(value, key) as unknown as IDBRequest<undefined>).then(
      () => undefined,
    );
  },

  delete(key: string): Promise<void> {
    return tx('readwrite', (store) => store.delete(key) as unknown as IDBRequest<undefined>).then(
      () => undefined,
    );
  },

  clear(): Promise<void> {
    return tx('readwrite', (store) => store.clear() as unknown as IDBRequest<undefined>).then(
      () => undefined,
    );
  },

  /** 判断 IndexedDB 是否可用（隐私模式/沙箱下可能不可用） */
  async isAvailable(): Promise<boolean> {
    try {
      await openDB();
      return true;
    } catch {
      return false;
    }
  },
};
