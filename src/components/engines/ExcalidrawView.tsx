import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CaptureUpdateAction,
  Excalidraw,
  exportToBlob,
  exportToSvg,
  restore,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import '@excalidraw/excalidraw/index.css';
import { useAppStore } from '../../store/useAppStore';
import { storage, STORAGE_KEYS } from '../../services/storage';
import { files as fileService, filesReady } from '../../services/files';
import { downloadBlob, downloadText, stampName } from '../../utils/download';
import type { EngineAdapter, ExportFormat, ImportFormat, ThemeMode } from '../../types';

/** 持久化到 localStorage / IndexedDB 的数据结构 */
interface SavedExcalidraw {
  elements: readonly ExcalidrawElement[];
  appState: Record<string, unknown>;
  files?: BinaryFiles;
}

/**
 * 需要持久化的 appState 字段。
 * Excalidraw 的 appState 包含大量瞬态字段（协作者、选中态、弹窗状态等），
 * 全量落盘会显著放大存储占用且可能引入脏状态，这里只保留与画布强相关的部分。
 */
const PERSIST_APPSTATE_KEYS = [
  'viewBackgroundColor',
  'scrollX',
  'scrollY',
  'zoom',
  'theme',
  'gridSize',
  'gridStep',
  'gridModeEnabled',
  'zenModeEnabled',
  'objectsSnapModeEnabled',
  'exportBackground',
  'exportWithDarkMode',
  'currentItemStrokeColor',
  'currentItemBackgroundColor',
  'currentItemFillStyle',
  'currentItemStrokeWidth',
  'currentItemStrokeStyle',
  'currentItemRoughness',
  'currentItemOpacity',
  'currentItemFontFamily',
  'currentItemFontSize',
  'currentItemTextAlign',
  'currentItemRoundness',
  'currentItemArrowType',
] as const;

const THEME_BG: Record<ThemeMode, string> = { light: '#ffffff', dark: '#1e1e1e' };
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;

/** restore() 接受的入参形态（等价于 Excalidraw 的 ImportedDataState 子集） */
type ImportedScene = Parameters<typeof restore>[0];

function trimAppState(appState: AppState): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of PERSIST_APPSTATE_KEYS) {
    const value = (appState as unknown as Record<string, unknown>)[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
}

/** 仅保留被元素引用的图片资源，避免删除元素后残留二进制垃圾 */
function pickUsedFiles(
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles | null | undefined,
): BinaryFiles {
  if (!files) return {};
  const used: BinaryFiles = {};
  for (const el of elements) {
    const fileId = (el as unknown as { fileId?: string }).fileId;
    if (fileId && files[fileId]) used[fileId] = files[fileId];
  }
  return used;
}

export default function ExcalidrawView() {
  const theme = useAppStore((s) => s.theme);
  const autosaveDelay = useAppStore((s) => s.settings.autosaveDelay);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const registerAdapter = useAppStore((s) => s.registerAdapter);
  const unregisterAdapter = useAppStore((s) => s.unregisterAdapter);
  const markSaved = useAppStore((s) => s.markSaved);
  const setScale = useAppStore((s) => s.setScale);
  const pushToast = useAppStore((s) => s.pushToast);

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const dataRef = useRef<{
    elements: readonly ExcalidrawElement[];
    appState: AppState;
    files: BinaryFiles;
  } | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const themeBgRef = useRef<string>(theme === 'dark' ? THEME_BG.dark : THEME_BG.light);

  const [initialData, setInitialData] = useState<ExcalidrawInitialDataState | null>(null);

  // 读取当前活动文件后再挂载画布，避免 initialData 竞态
  useEffect(() => {
    let cancelled = false;
    setEngineStatus('excalidraw', 'loading');
    void (async () => {
      const { active } = await filesReady();
      const id = active.excalidraw ?? useAppStore.getState().activeFileId.excalidraw;
      let saved: SavedExcalidraw | null = null;
      if (id) {
        const raw = await fileService.read(id);
        if (raw) {
          try {
            saved = JSON.parse(raw) as SavedExcalidraw;
          } catch {
            saved = null;
          }
        }
      }
      // 老版本单键存档兜底
      if (!saved) saved = await storage.get<SavedExcalidraw>(STORAGE_KEYS.EXCALIDRAW);
      if (cancelled) return;
      const next: ExcalidrawInitialDataState = saved
        ? {
            elements: saved.elements ?? [],
            appState: { ...(saved.appState ?? {}) } as Partial<AppState>,
            files: saved.files ?? {},
          }
        : {
            elements: [],
            appState: { viewBackgroundColor: THEME_BG[theme] } as Partial<AppState>,
          };
      themeBgRef.current =
        (next.appState?.viewBackgroundColor as string | undefined) ?? THEME_BG[theme];
      setInitialData(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialData) setEngineStatus('excalidraw', 'ready');
  }, [initialData, setEngineStatus]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dataRef.current) return;
    const { elements, appState, files } = dataRef.current;
    const saved: SavedExcalidraw = {
      elements,
      appState: trimAppState(appState),
      files: pickUsedFiles(elements, files),
    };
    // 优先写进「本地文件目录树」的当前活动文件；没有活动文件时退回单键存档
    const id = useAppStore.getState().activeFileId.excalidraw;
    if (id) {
      void fileService.write(id, JSON.stringify(saved)).then(() =>
        useAppStore.getState().refreshFiles(),
      );
    } else {
      void storage.set(STORAGE_KEYS.EXCALIDRAW, saved);
    }
    markSaved('excalidraw');
  }, [markSaved]);

  const handleChange = useCallback(
    (elements: readonly ExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      dataRef.current = { elements, appState, files };
      setScale('excalidraw', appState.zoom?.value ?? 1);
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(flushSave, autosaveDelay);
    },
    [autosaveDelay, flushSave, setScale],
  );

  /** 构造导出用的 appState：强制导出背景，并按主题决定是否使用深色模式导出 */
  const buildExportAppState = useCallback((): Partial<AppState> | undefined => {
    const appState = apiRef.current?.getAppState() ?? dataRef.current?.appState;
    if (!appState) return undefined;
    return {
      ...appState,
      exportBackground: true,
      exportWithDarkMode: theme === 'dark',
      exportEmbedScene: true,
      viewBackgroundColor: appState.viewBackgroundColor || THEME_BG[theme],
    } as Partial<AppState>;
  }, [theme]);

  const applyZoom = useCallback((next: number) => {
    const api = apiRef.current;
    if (!api) return;
    const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    api.updateScene({
      appState: { zoom: { value: clamped } as AppState['zoom'] },
    });
  }, []);

  // 主题变化时同步画布背景（仅当背景仍是上一个主题的默认色，避免覆盖用户自定义色）
  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const current = api.getAppState().viewBackgroundColor;
    if (current && current !== themeBgRef.current) return;
    const next = THEME_BG[theme];
    themeBgRef.current = next;
    api.updateScene({ appState: { viewBackgroundColor: next } });
  }, [theme]);

  // 注册适配器
  useEffect(() => {
    const adapter: EngineAdapter = {
      save: () => {
        flushSave();
      },
      getContent: () => {
        const d = dataRef.current;
        if (!d) return null;
        return JSON.stringify({
          elements: d.elements,
          appState: trimAppState(d.appState),
          files: pickUsedFiles(d.elements, d.files),
        });
      },
      loadContent: async (content: string) => {
        const api = apiRef.current;
        if (!api) throw new Error('画布尚未就绪，请稍后重试');
        const fallbackBg = THEME_BG[useAppStore.getState().theme];
        let scene: ImportedScene | null = null;
        if (content && content.trim()) {
          try {
            scene = JSON.parse(content) as ImportedScene;
          } catch {
            scene = null;
          }
        }
        if (scene && Array.isArray(scene.elements)) {
          const restored = restore(scene, api.getAppState(), null);
          const fileList = Object.values(restored.files);
          if (fileList.length) api.addFiles(fileList);
          api.updateScene({
            elements: restored.elements,
            appState: { viewBackgroundColor: restored.appState.viewBackgroundColor ?? fallbackBg },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        } else {
          // 空内容 = 新建文件，回到空白画布
          api.updateScene({
            elements: [],
            appState: { viewBackgroundColor: fallbackBg },
            captureUpdate: CaptureUpdateAction.IMMEDIATELY,
          });
        }
        flushSave();
      },
      getScale: () => apiRef.current?.getAppState().zoom?.value ?? null,
      zoomIn: () => applyZoom((apiRef.current?.getAppState().zoom?.value ?? 1) * 1.2),
      zoomOut: () => applyZoom((apiRef.current?.getAppState().zoom?.value ?? 1) / 1.2),
      zoomReset: () => applyZoom(1),
      zoomFit: () => {
        const api = apiRef.current;
        if (!api) return;
        const elements = api.getSceneElements();
        if (elements.length === 0) {
          applyZoom(1);
          return;
        }
        api.scrollToContent(elements, { fitToViewport: true, animate: true, viewportZoomFactor: 0.85 });
      },
      exportAs: async (format: ExportFormat) => {
        const api = apiRef.current;
        if (!api) {
          pushToast('error', '画布尚未就绪');
          return;
        }
        const elements = api.getSceneElements();
        if (elements.length === 0) {
          pushToast('info', '画布为空，无可导出内容');
          return;
        }
        const files = api.getFiles();
        const appState = buildExportAppState();
        try {
          if (format === 'png') {
            const blob = await exportToBlob({
              elements,
              appState,
              files,
              mimeType: 'image/png',
              exportPadding: 16,
              quality: 0.92,
              getDimensions: (w: number, h: number) => ({ width: w * 2, height: h * 2, scale: 2 }),
            });
            downloadBlob(blob, stampName('drawhub-excalidraw', 'png'));
          } else if (format === 'svg') {
            const svg = await exportToSvg({ elements, appState, files, exportPadding: 16 });
            const text = new XMLSerializer().serializeToString(svg);
            downloadText(text, stampName('drawhub-excalidraw', 'svg'), 'image/svg+xml');
          } else if (format === 'json') {
            const json = serializeAsJSON(elements, appState ?? {}, files, 'local');
            downloadText(json, stampName('drawhub-excalidraw', 'json'), 'application/json');
          } else {
            pushToast('error', `Excalidraw 不支持导出 ${format.toUpperCase()}`);
            return;
          }
          pushToast('success', `已导出 ${format.toUpperCase()}`);
        } catch (err) {
          console.error('[DrawHub] Excalidraw 导出失败', err);
          pushToast('error', '导出失败，请查看控制台');
        }
      },
      importAs: async (format: ImportFormat, content: string | ArrayBuffer) => {
        if (format !== 'json') {
          pushToast('error', `Excalidraw 不支持导入 ${format.toUpperCase()}`);
          return;
        }
        const api = apiRef.current;
        if (!api) throw new Error('画布尚未就绪，请稍后重试');

        const text =
          typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error('JSON 解析失败，请选择 Excalidraw 导出的场景文件');
        }
        const scene = parsed as ImportedScene | null;
        if (!scene || !Array.isArray(scene.elements)) {
          throw new Error('不是有效的 Excalidraw 场景，缺少 elements 字段');
        }

        // restore 负责补齐元素默认值、修复箭头绑定，等价于 Excalidraw 官方打开文件的处理
        const restored = restore(scene, api.getAppState(), null);
        const files = Object.values(restored.files);
        if (files.length) api.addFiles(files);

        api.updateScene({
          elements: restored.elements,
          appState: { viewBackgroundColor: restored.appState.viewBackgroundColor },
          // 立即进入撤销栈，让用户能用 Ctrl+Z 退回导入前
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });

        if (restored.elements.length > 0) {
          api.scrollToContent(restored.elements, {
            fitToViewport: true,
            animate: false,
            viewportZoomFactor: 0.85,
          });
        }
      },
    };
    registerAdapter('excalidraw', adapter);
    return () => {
      unregisterAdapter('excalidraw');
      flushSave();
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [
    registerAdapter,
    unregisterAdapter,
    flushSave,
    applyZoom,
    buildExportAppState,
    pushToast,
  ]);

  return (
    <div className="engine-excalidraw">
      {initialData ? (
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api;
            setScale('excalidraw', api.getAppState().zoom?.value ?? 1);
          }}
          initialData={initialData}
          onChange={handleChange}
          theme={theme}
          UIOptions={{ canvasActions: { loadScene: true, saveToActiveFile: false } }}
        />
      ) : (
        <div className="engine-loading">正在读取本地存档…</div>
      )}
    </div>
  );
}
