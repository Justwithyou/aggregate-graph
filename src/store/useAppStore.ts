import { create } from 'zustand';
import type {
  AppSettings,
  DialogId,
  EngineAdapter,
  EngineId,
  EngineStatus,
  ThemeMode,
  Toast,
  ToastType,
} from '../types';
import { DEFAULT_SETTINGS } from '../constants';
import { storage, STORAGE_KEYS } from '../services/storage';

let toastSeq = 0;

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
}));

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
