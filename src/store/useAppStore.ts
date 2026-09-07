import { create } from 'zustand';
import type {
  AppSettings,
  DialogId,
  EngineAdapter,
  EngineId,
  EngineStatus,
  FileRecord,
  ThemeMode,
  Toast,
  ToastType,
} from '../types';
import {
  DEFAULT_SETTINGS,
  ENGINE_FILE_PREFIX,
  ENGINE_META,
  ENGINE_ORDER,
} from '../constants';
import { storage, STORAGE_KEYS } from '../services/storage';
import { files } from '../services/files';

let toastSeq = 0;
/** 文件索引刷新节流时间戳（见 refreshFiles） */
let lastFilesSync = 0;

interface AppState {
  activeEngine: EngineId;
  theme: ThemeMode;
  engineStatus: Record<EngineId, EngineStatus>;
  lastSaved: Record<EngineId, number | null>;
  adapters: Partial<Record<EngineId, EngineAdapter>>;
  scale: Record<EngineId, number | null>;
  settings: AppSettings;
  sidebarCollapsed: boolean;
  activeDialog: DialogId;
  toasts: Toast[];
  storageUsage: { total: number; quota: number | null } | null;

  /** 本地文件目录树 */
  files: FileRecord[];
  /** 每个引擎当前打开的文件 id */
  activeFileId: Record<EngineId, string | null>;

  setEngine: (engine: EngineId) => void;
  toggleTheme: () => void;
  setEngineStatus: (engine: EngineId, status: EngineStatus) => void;
  markSaved: (engine: EngineId) => void;
  registerAdapter: (engine: EngineId, adapter: EngineAdapter) => void;
  unregisterAdapter: (engine: EngineId) => void;
  setScale: (engine: EngineId, scale: number | null) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  toggleSidebar: () => void;
  setDialog: (dialog: DialogId) => void;
  pushToast: (type: ToastType, message: string) => void;
  dismissToast: (id: number) => void;
  saveActive: () => void | Promise<void>;
  refreshUsage: () => Promise<void>;

  initFiles: () => Promise<void>;
  /** force = true 时忽略节流（手动操作后调用）；自动保存走节流路径 */
  refreshFiles: (force?: boolean) => Promise<void>;
  setActiveFile: (engine: EngineId, id: string | null) => void;
  createFile: (engine: EngineId, name?: string) => Promise<FileRecord | null>;
  openFile: (id: string) => Promise<void>;
  renameFile: (id: string, name: string) => Promise<void>;
  deleteFile: (id: string) => Promise<void>;
  saveActiveAs: (name?: string) => Promise<FileRecord | null>;
}

const initialTheme: ThemeMode = storage.getRawSync(STORAGE_KEYS.THEME) === 'dark' ? 'dark' : 'light';
const initialSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  ...(storage.getSync<Partial<AppSettings>>(STORAGE_KEYS.SETTINGS) ?? {}),
};

export const useAppStore = create<AppState>((set, get) => ({
  activeEngine: 'drawio',
  theme: initialTheme,
  engineStatus: { drawio: 'idle', excalidraw: 'idle', mindmap: 'idle' },
  lastSaved: { drawio: null, excalidraw: null, mindmap: null },
  adapters: {},
  scale: { drawio: null, excalidraw: null, mindmap: null },
  settings: initialSettings,
  sidebarCollapsed: initialSettings.sidebarCollapsed,
  activeDialog: null,
  toasts: [],
  storageUsage: null,

  files: [],
  activeFileId: { drawio: null, excalidraw: null, mindmap: null },

  setEngine: (engine) => set({ activeEngine: engine }),

  toggleTheme: () => {
    const next: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    storage.setRawSync(STORAGE_KEYS.THEME, next);
    set({ theme: next });
  },

  setEngineStatus: (engine, status) =>
    set((s) => ({ engineStatus: { ...s.engineStatus, [engine]: status } })),

  markSaved: (engine) => set((s) => ({ lastSaved: { ...s.lastSaved, [engine]: Date.now() } })),

  registerAdapter: (engine, adapter) =>
    set((s) => ({ adapters: { ...s.adapters, [engine]: adapter } })),

  unregisterAdapter: (engine) =>
    set((s) => {
      const next = { ...s.adapters };
      delete next[engine];
      return { adapters: next };
    }),

  setScale: (engine, scale) => set((s) => ({ scale: { ...s.scale, [engine]: scale } })),

  updateSettings: (patch) => {
    const next = { ...get().settings, ...patch };
    storage.setSync(STORAGE_KEYS.SETTINGS, next);
    set({ settings: next, sidebarCollapsed: next.sidebarCollapsed });
  },

  toggleSidebar: () => get().updateSettings({ sidebarCollapsed: !get().sidebarCollapsed }),

  setDialog: (dialog) => set({ activeDialog: dialog }),

  pushToast: (type, message) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, type, message }] }));
    window.setTimeout(() => get().dismissToast(id), type === 'error' ? 5000 : 2400);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  saveActive: () => {
    const { activeEngine, adapters, markSaved, pushToast } = get();
    const adapter = adapters[activeEngine];
    if (!adapter) {
      pushToast('info', '当前引擎尚未就绪');
      return;
    }
    const result = adapter.save();
    return Promise.resolve(result)
      .then(() => {
        markSaved(activeEngine);
        pushToast('success', '已保存');
      })
      .catch((err) => {
        console.error('[DrawHub] 保存失败', err);
        pushToast('error', '保存失败，请查看控制台');
      });
  },

  refreshUsage: async () => {
    const { total, quota } = await storage.usage();
    set({ storageUsage: { total, quota } });
  },

  // ---------- 本地文件目录树 ----------

  initFiles: async () => {
    // 走 files.ready() 与引擎组件的 filesReady() 共享同一个 Promise，避免迁移被并发执行两次
    const { list, active } = await files.ready();
    set({
      files: list,
      activeFileId: {
        drawio: active.drawio ?? null,
        excalidraw: active.excalidraw ?? null,
        mindmap: active.mindmap ?? null,
      },
    });
  },

  refreshFiles: async (force) => {
    // 自动保存每隔几百毫秒就会写一次文件，没必要每次都刷新整个索引；
    // 这里做 3s 节流，手动的新建/重命名/删除用 force 立即刷新。
    const now = Date.now();
    if (!force && now - lastFilesSync < 3000) return;
    lastFilesSync = now;
    set({ files: files.listSync() });
  },

  setActiveFile: (engine, id) => {
    const next = { ...get().activeFileId, [engine]: id };
    files.writeActiveSync(next);
    set({ activeFileId: next });
  },

  createFile: async (engine, name) => {
    const record = await files.create(engine, name);
    await get().refreshFiles(true);
    get().setActiveFile(engine, record.id);
    if (get().activeEngine !== engine) get().setEngine(engine);
    // 空内容会让引擎回到自带默认画布，等价于「新建」
    const adapter = get().adapters[engine];
    if (adapter?.loadContent) {
      try {
        await adapter.loadContent('');
      } catch (e) {
        console.error('[DrawHub] 新建文件后重置画布失败', e);
      }
    }
    get().pushToast('success', `已新建「${record.name}」`);
    return record;
  },

  openFile: async (id) => {
    const record = get().files.find((f) => f.id === id);
    if (!record) return;
    const { engine } = record;
    get().setActiveFile(engine, id);
    if (get().activeEngine !== engine) get().setEngine(engine);

    // 引擎已挂载就绪 → 直接把内容灌进画布；
    // 未挂载时引擎会在自己启动时按 activeFileId 读取，这里不做处理。
    const adapter = get().adapters[engine];
    if (adapter?.loadContent) {
      const content = (await files.read(id)) ?? '';
      try {
        await adapter.loadContent(content);
        get().markSaved(engine);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        get().pushToast('error', `打开「${record.name}」失败：${msg}`);
        return;
      }
    }
    get().pushToast('info', `已打开「${record.name}」`);
  },

  renameFile: async (id, name) => {
    const list = await files.rename(id, name);
    set({ files: list });
  },

  deleteFile: async (id) => {
    const target = get().files.find((f) => f.id === id);
    if (!target) return;
    const list = await files.remove(id);
    set({ files: list });

    const active = { ...get().activeFileId };
    if (active[target.engine] === id) {
      const fallback = list.find((f) => f.engine === target.engine);
      if (fallback) {
        active[target.engine] = fallback.id;
      } else {
        // 删掉了该引擎最后一个文件：补一个空的，避免后续自动保存无处可写
        const created = await files.create(target.engine);
        list.push(created);
        set({ files: [...list] });
        active[target.engine] = created.id;
      }
    }
    files.writeActiveSync(active);
    set({ activeFileId: active });
    get().pushToast('success', `已删除「${target.name}」`);
  },

  saveActiveAs: async (name) => {
    const { activeEngine, adapters } = get();
    const adapter = adapters[activeEngine];
    let content = '';
    if (adapter?.getContent) {
      try {
        content = (await adapter.getContent()) ?? '';
      } catch (e) {
        console.error('[DrawHub] 读取当前画布内容失败', e);
      }
    }
    const record = await files.create(activeEngine, name, content);
    await get().refreshFiles(true);
    get().setActiveFile(activeEngine, record.id);
    get().markSaved(activeEngine);
    get().pushToast('success', `已另存为「${record.name}」`);
    return record;
  },
}));

/** 取引擎的展示名，供文件树/提示复用 */
export function engineLabel(engine: EngineId): string {
  return ENGINE_META[engine].short;
}

/** 生成一个不重复的默认文件名（按引擎现有数量递增） */
export function nextFileName(engine: EngineId, existing: FileRecord[]): string {
  const base = ENGINE_FILE_PREFIX[engine];
  const used = new Set(existing.filter((f) => f.engine === engine).map((f) => f.name));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

export { ENGINE_ORDER };

// 存储层错误（如配额超限）统一转成用户可见提示
storage.onError((kind, err) => {
  console.error('[DrawHub] 存储异常', err);
  useAppStore
    .getState()
    .pushToast(
      'error',
      kind === 'quota'
        ? '本地存储空间不足，请清理或导出备份后重试'
        : '本地存储写入失败，数据可能未被保存',
    );
});
