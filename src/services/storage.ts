import { idb } from './idb';

export const STORAGE_KEYS = {
  DRAWIO_XML: 'drawhub_drawio_xml',
  EXCALIDRAW: 'drawhub_excalidraw',
  MINDMAP: 'drawhub_mindmap',
  THEME: 'drawhub_theme',
  SETTINGS: 'drawhub_settings',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

const ALL_KEYS = Object.values(STORAGE_KEYS) as StorageKey[];

/** 超过该体积的原始字符串转存 IndexedDB，避免占用 localStorage 配额 */
const IDB_THRESHOLD = 256 * 1024;

export type StorageErrorKind = 'quota' | 'unknown';
type ErrorListener = (kind: StorageErrorKind, error: unknown) => void;

const errorListeners = new Set<ErrorListener>();

function reportError(error: unknown): void {
  const name = (error as { name?: string } | null)?.name ?? '';
  const kind: StorageErrorKind =
    name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'quota' : 'unknown';
  errorListeners.forEach((fn) => fn(kind, error));
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function lsGet(key: StorageKey): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    reportError(e);
    return null;
  }
}

function lsSet(key: StorageKey, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (e) {
    reportError(e);
    return false;
  }
}

function lsRemove(key: StorageKey): void {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    reportError(e);
  }
}

/** 备份快照格式 */
export interface StorageSnapshot {
  app: 'drawhub';
  version: 1;
  exportedAt: string;
  data: Partial<Record<StorageKey, string>>;
}

/**
 * 统一本地存储服务。
 *
 * 分层策略：
 * - 主题、设置等小数据 → localStorage 同步读写（应用启动即需）
 * - 引擎数据 → 异步读写；超过阈值自动转存 IndexedDB，兼顾速度与容量
 * - 读取时按 localStorage → IndexedDB 顺序查找，兼容历史数据
 *
 * 所有数据仅存本地，无网络上传、无数据库服务。
 */
export const storage = {
  /** 订阅存储错误（如配额超限），用于向用户提示 */
  onError(fn: ErrorListener): () => void {
    errorListeners.add(fn);
    return () => errorListeners.delete(fn);
  },

  // ---------- 同步 API（仅用于主题/设置等启动必需的小数据） ----------

  getSync<T>(key: StorageKey): T | null {
    return safeParse<T>(lsGet(key));
  },

  setSync(key: StorageKey, value: unknown): void {
    lsSet(key, JSON.stringify(value));
  },

  getRawSync(key: StorageKey): string | null {
    return lsGet(key);
  },

  setRawSync(key: StorageKey, value: string): void {
    lsSet(key, value);
  },

  // ---------- 异步 API（引擎数据） ----------

  async get<T>(key: StorageKey): Promise<T | null> {
    const local = safeParse<T>(lsGet(key));
    if (local !== null) return local;
    try {
      const fromIdb = await idb.get<T>(key);
      return fromIdb ?? null;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  async set(key: StorageKey, value: unknown): Promise<void> {
    await this.setRaw(key, JSON.stringify(value));
  },

  async getRaw(key: StorageKey): Promise<string | null> {
    const local = lsGet(key);
    if (local !== null) return local;
    try {
      const fromIdb = await idb.get<string>(key);
      return fromIdb ?? null;
    } catch (e) {
      reportError(e);
      return null;
    }
  },

  async setRaw(key: StorageKey, value: string): Promise<void> {
    // 大对象优先落到 IndexedDB；同时清理另一层，避免双写产生脏数据
    if (value.length > IDB_THRESHOLD) {
      try {
        await idb.set(key, value);
        lsRemove(key);
        return;
      } catch (e) {
        reportError(e);
        // IndexedDB 不可用时退化为 localStorage
      }
    }
    if (lsSet(key, value)) {
      try {
        await idb.delete(key);
      } catch {
        /* ignore */
      }
    }
  },

  async remove(key: StorageKey): Promise<void> {
    lsRemove(key);
    try {
      await idb.delete(key);
    } catch (e) {
      reportError(e);
    }
  },

  /** 估算各引擎数据占用（字节） */
  async usage(): Promise<{ total: number; detail: Record<StorageKey, number>; quota: number | null }> {
    const detail = {} as Record<StorageKey, number>;
    let total = 0;
    for (const key of ALL_KEYS) {
      const raw = (await this.getRaw(key)) ?? '';
      const size = new Blob([raw]).size;
      detail[key] = size;
      total += size;
    }
    let quota: number | null = null;
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        if (typeof est.quota === 'number') quota = est.quota;
      }
    } catch {
      /* ignore */
    }
    return { total, detail, quota };
  },

  /** 导出全部本地数据为快照 */
  async exportSnapshot(): Promise<StorageSnapshot> {
    const data: Partial<Record<StorageKey, string>> = {};
    for (const key of ALL_KEYS) {
      const raw = await this.getRaw(key);
      if (raw !== null) data[key] = raw;
    }
    return { app: 'drawhub', version: 1, exportedAt: new Date().toISOString(), data };
  },

  /** 从快照恢复（整体覆盖） */
  async importSnapshot(snapshot: StorageSnapshot): Promise<void> {
    if (!snapshot || snapshot.app !== 'drawhub' || typeof snapshot.data !== 'object') {
      throw new Error('备份文件格式不正确');
    }
    for (const key of ALL_KEYS) {
      const raw = snapshot.data[key];
      if (typeof raw === 'string') {
        await this.setRaw(key, raw);
      } else {
        await this.remove(key);
      }
    }
  },

  /** 清空全部本地数据 */
  async clearAll(): Promise<void> {
    for (const key of ALL_KEYS) lsRemove(key);
    try {
      await idb.clear();
    } catch (e) {
      reportError(e);
    }
  },
};
