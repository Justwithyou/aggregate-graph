import { idb } from './idb';
import { storage, STORAGE_KEYS } from './storage';
import { ENGINE_FILE_FORMAT, ENGINE_FILE_PREFIX, ENGINE_ORDER } from '../constants';
import type { EngineId, FileFormat, FileRecord } from '../types';

/**
 * 本地文件目录树服务。
 *
 * 设计要点：
 * - 索引（FileRecord[]）放 localStorage：条目数少、需要同步读取、启动即用。
 * - 内容放 IndexedDB：单个图表可达数 MB，不能挤占 localStorage 约 5MB 配额。
 * - 每个引擎可以同时存在多个文件，由 store 维护「当前活动文件」。
 *
 * 首次启动时执行一次性迁移：把历史上按引擎单键保存的内容
 * （drawhub_drawio_xml / drawhub_excalidraw / drawhub_mindmap）
 * 转成一个默认文件，保证老用户此前保存的内容可以直接打开。
 */

const INDEX_KEY = 'drawhub_files_index';
const ACTIVE_KEY = 'drawhub_files_active';
const MIGRATED_KEY = 'drawhub_files_migrated';

/** 文件内容在 IndexedDB 中的键 */
const contentKey = (id: string) => `drawhub_file_${id}`;

function newId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readIndex(): FileRecord[] {
  try {
    const raw = window.localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // 过滤掉结构不完整的脏数据，避免一处损坏导致整个面板不可用
    return parsed.filter(
      (it): it is FileRecord =>
        !!it &&
        typeof (it as FileRecord).id === 'string' &&
        typeof (it as FileRecord).name === 'string' &&
        ENGINE_ORDER.includes((it as FileRecord).engine),
    );
  } catch {
    return [];
  }
}

function writeIndex(list: FileRecord[]): void {
  try {
    window.localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('[DrawHub] 文件索引写入失败', e);
  }
}

function readActive(): Partial<Record<EngineId, string | null>> {
  try {
    const raw = window.localStorage.getItem(ACTIVE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<EngineId, string | null>>) : {};
  } catch {
    return {};
  }
}

function writeActive(map: Partial<Record<EngineId, string | null>>): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(map));
  } catch (e) {
    console.error('[DrawHub] 活动文件写入失败', e);
  }
}

function byteSize(text: string): number {
  return new Blob([text]).size;
}

/** 把老的单键存档迁移成「每个引擎一个默认文件」 */
async function migrateLegacy(list: FileRecord[]): Promise<FileRecord[]> {
  const legacyKeys: Record<EngineId, keyof typeof STORAGE_KEYS> = {
    drawio: 'DRAWIO_XML',
    excalidraw: 'EXCALIDRAW',
    mindmap: 'MINDMAP',
  };
  const next = [...list];
  for (const engine of ENGINE_ORDER) {
    if (next.some((f) => f.engine === engine)) continue;
    const raw = await storage.getRaw(STORAGE_KEYS[legacyKeys[engine]]);
    const id = newId();
    const now = Date.now();
    if (raw) {
      await idb.set(contentKey(id), raw).catch(() => undefined);
    }
    next.push({
      id,
      name: ENGINE_FILE_PREFIX[engine],
      engine,
      format: ENGINE_FILE_FORMAT[engine],
      createdAt: now,
      updatedAt: now,
      size: raw ? byteSize(raw) : 0,
    });
  }
  writeIndex(next);
  try {
    window.localStorage.setItem(MIGRATED_KEY, '1');
  } catch {
    /* ignore */
  }
  return next;
}

export interface FilesInitResult {
  list: FileRecord[];
  active: Partial<Record<EngineId, string | null>>;
}

/** 索引初始化只会真正跑一次，后续调用共享同一个 Promise */
let initPromise: Promise<FilesInitResult> | null = null;

export const files = {
  /**
   * 引擎组件挂载早于 App 的 effect，因此不能直接信任 store 里的 activeFileId。
   * 统一走这里：拿到的 active 一定已经完成索引读取与历史迁移。
   */
  ready(): Promise<FilesInitResult> {
    if (!initPromise) initPromise = files.init();
    return initPromise;
  },

  /** 同步读取索引（启动后已由 init 填充） */
  listSync(): FileRecord[] {
    return readIndex();
  },

  readActiveSync(): Partial<Record<EngineId, string | null>> {
    return readActive();
  },

  writeActiveSync(map: Partial<Record<EngineId, string | null>>): void {
    writeActive(map);
  },

  /** 启动时调用：读取索引，必要时做一次历史数据迁移，并补齐缺省文件 */
  async init(): Promise<FilesInitResult> {
    let list = readIndex();
    const migrated = (() => {
      try {
        return window.localStorage.getItem(MIGRATED_KEY) === '1';
      } catch {
        return false;
      }
    })();

    if (!migrated) {
      list = await migrateLegacy(list);
    } else if (list.length === 0) {
      // 迁移已做过但索引被清掉（例如清空数据）：重新补一份空文件，避免面板空白
      list = await migrateLegacy(list);
    }

    // 活动文件：清理指向已删除文件的 id，并为没有活动文件的引擎指定第一个
    const active = readActive();
    for (const engine of ENGINE_ORDER) {
      const current = active[engine];
      if (current && list.some((f) => f.id === current)) continue;
      active[engine] = list.find((f) => f.engine === engine)?.id ?? null;
    }
    writeActive(active);
    return { list, active };
  },

  async create(engine: EngineId, name?: string, content = ''): Promise<FileRecord> {
    const list = readIndex();
    const now = Date.now();
    const base = name?.trim() || ENGINE_FILE_PREFIX[engine];
    // 同名自动加序号：未命名白板、未命名白板 2、未命名白板 3 …
    let finalName = base;
    let n = 2;
    while (list.some((f) => f.name === finalName)) {
      finalName = `${base} ${n++}`;
    }
    const id = newId();
    const record: FileRecord = {
      id,
      name: finalName,
      engine,
      format: ENGINE_FILE_FORMAT[engine],
      createdAt: now,
      updatedAt: now,
      size: byteSize(content),
    };
    await idb.set(contentKey(id), content).catch((e) => console.error('[DrawHub] 文件写入失败', e));
    writeIndex([...list, record]);
    return record;
  },

  async read(id: string): Promise<string | null> {
    try {
      const value = await idb.get<string>(contentKey(id));
      return typeof value === 'string' ? value : null;
    } catch (e) {
      console.error('[DrawHub] 文件读取失败', e);
      return null;
    }
  },

  /** 写入内容并刷新索引里的体积与更新时间 */
  async write(id: string, content: string): Promise<void> {
    await idb.set(contentKey(id), content).catch((e) => console.error('[DrawHub] 文件写入失败', e));
    const list = readIndex();
    const idx = list.findIndex((f) => f.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], updatedAt: Date.now(), size: byteSize(content) };
    writeIndex(list);
  },

  async rename(id: string, name: string): Promise<FileRecord[]> {
    const trimmed = name.trim();
    if (!trimmed) return readIndex();
    const list = readIndex();
    const idx = list.findIndex((f) => f.id === id);
    if (idx < 0) return list;
    // 同名自动加序号，避免重名造成辨识困难
    let finalName = trimmed;
    let n = 2;
    while (list.some((f, i) => i !== idx && f.name === finalName)) {
      finalName = `${trimmed} ${n++}`;
    }
    list[idx] = { ...list[idx], name: finalName, updatedAt: Date.now() };
    writeIndex(list);
    return list;
  },

  async remove(id: string): Promise<FileRecord[]> {
    const list = readIndex().filter((f) => f.id !== id);
    writeIndex(list);
    await idb.delete(contentKey(id)).catch(() => undefined);
    return list;
  },

  /** 复制一份（内容一并复制），用于「另存为」或「创建副本」 */
  async duplicate(id: string, name?: string): Promise<FileRecord | null> {
    const list = readIndex();
    const src = list.find((f) => f.id === id);
    if (!src) return null;
    const content = (await this.read(id)) ?? '';
    return this.create(src.engine, name ?? `${src.name} 副本`, content);
  },

  /** 清空文件（数据管理里「清空数据」时调用） */
  async clearAll(): Promise<void> {
    const list = readIndex();
    for (const f of list) {
      await idb.delete(contentKey(f.id)).catch(() => undefined);
    }
    try {
      window.localStorage.removeItem(INDEX_KEY);
      window.localStorage.removeItem(ACTIVE_KEY);
      window.localStorage.removeItem(MIGRATED_KEY);
    } catch {
      /* ignore */
    }
  },

  /** 导出某个文件到磁盘用的建议文件名 */
  suggestName(record: FileRecord): string {
    const ext = record.format === 'xml' ? 'drawio.xml' : 'json';
    return `${record.name.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;
  },
};

/** 引擎组件统一入口：等待索引/迁移就绪（内部共享同一个 Promise，避免重复迁移） */
export const filesReady = (): Promise<FilesInitResult> => files.ready();

export type { FileFormat };
