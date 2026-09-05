import { useCallback, useEffect, useRef, useState } from 'react';
import MindMap from 'simple-mind-map/full.js';
import 'simple-mind-map/dist/simpleMindMap.esm.min.css';
import { transformMarkdownTo } from 'simple-mind-map/src/parse/markdownTo.js';
import xmindParser from 'simple-mind-map/src/parse/xmind.js';
import { useAppStore } from '../../store/useAppStore';
import { storage, STORAGE_KEYS } from '../../services/storage';
import type { EngineAdapter, ExportFormat, ImportFormat, ThemeMode } from '../../types';

/**
 * 全局默认字体栈：与 Excalidraw 官网 UI 对齐（Assistant + 系统字体 + 中文回退）。
 * simple-mind-map 主题默认写死「微软雅黑」，不跟随全局 --font，这里显式覆盖，
 * 让节点文字与 DrawHub 全局字体保持一致。
 */
const GLOBAL_FONT_FAMILY =
  "'Assistant', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif";

/** simple-mind-map 内置 default 主题仅适配亮色，深色通过 themeConfig 覆盖 */
const THEME_CONFIG: Record<ThemeMode, Record<string, any>> = {
  light: {
    // 仅覆盖字体，其余沿用内置 default 主题配色
    root: { fontFamily: GLOBAL_FONT_FAMILY },
    second: { fontFamily: GLOBAL_FONT_FAMILY },
    node: { fontFamily: GLOBAL_FONT_FAMILY },
    generalization: { fontFamily: GLOBAL_FONT_FAMILY },
    associativeLineTextFontFamily: GLOBAL_FONT_FAMILY,
  },
  dark: {
    backgroundColor: '#1f2026',
    lineColor: '#5b6fd8',
    lineDasharray: 'none',
    root: { fillColor: '#4f6ef7', color: '#ffffff', fontFamily: GLOBAL_FONT_FAMILY },
    second: { fillColor: '#2a2b33', color: '#e6e8ec', borderColor: '#5b6fd8', fontFamily: GLOBAL_FONT_FAMILY },
    node: { color: '#c7ccd6', fontFamily: GLOBAL_FONT_FAMILY },
    generalization: { fillColor: '#2a2b33', color: '#e6e8ec', borderColor: '#5b6fd8', fontFamily: GLOBAL_FONT_FAMILY },
    associativeLineTextFontFamily: GLOBAL_FONT_FAMILY,
  },
};

const DEFAULT_DATA = { data: { text: '中心主题' }, children: [] };

const LAYOUT_OPTIONS = [
  { value: 'logicalStructure', label: '逻辑结构图' },
  { value: 'logicalStructureLeft', label: '向左逻辑结构' },
  { value: 'mindMap', label: '思维导图' },
  { value: 'organizationStructure', label: '组织结构图' },
  { value: 'catalogOrganization', label: '目录组织图' },
  { value: 'timeline', label: '时间轴' },
  { value: 'verticalTimeline', label: '竖向时间轴' },
  { value: 'fishbone', label: '鱼骨图' },
];

export default function MindMapView() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mindMapRef = useRef<MindMap | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const theme = useAppStore((s) => s.theme);
  const autosaveDelay = useAppStore((s) => s.settings.autosaveDelay);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const registerAdapter = useAppStore((s) => s.registerAdapter);
  const unregisterAdapter = useAppStore((s) => s.unregisterAdapter);
  const markSaved = useAppStore((s) => s.markSaved);
  const setScale = useAppStore((s) => s.setScale);
  const pushToast = useAppStore((s) => s.pushToast);

  const [ready, setReady] = useState(false);
  const [layout, setLayout] = useState('logicalStructure');

  // 初始化：先读取本地存档，再创建实例
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mindMapRef.current) return;
    let cancelled = false;
    let instance: MindMap | null = null;

    setEngineStatus('mindmap', 'loading');

    void storage.get<any>(STORAGE_KEYS.MINDMAP).then((saved) => {
      if (cancelled || !containerRef.current) return;

      const persist = () => {
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          if (mindMapRef.current) {
            void storage.set(STORAGE_KEYS.MINDMAP, mindMapRef.current.getData(false));
            markSaved('mindmap');
          }
        }, autosaveDelay);
      };

      const syncScale = () => {
        const scale = mindMapRef.current?.view.getTransformData().state.scale;
        if (typeof scale === 'number') setScale('mindmap', scale);
      };

      instance = new MindMap({
        el: containerRef.current,
        data: saved ?? DEFAULT_DATA,
        layout: 'logicalStructure',
        theme: 'default',
        themeConfig: THEME_CONFIG[theme],
        enableFreeDrag: true,
        // 关键修复：
        // 1) 关闭 fit —— smm 的 view.fit() 在窄容器里会等比缩放整图，导致文字几乎不可读
        // 2) 显式给缩放与居中的钩子，不让引擎自动 fit
        isFitViewOnInit: false,
        scale: 1,
      });
      mindMapRef.current = instance;

      instance.on('data_change', persist);
      instance.on('view_data_change', persist);
      instance.on('view_data_change', syncScale);

      // 渲染结束后把 svg 内 <text> 的 font-family 强制覆盖为全局字体栈
      // （smm 主题模块把 fontFamily 写进 SVG 属性，CSS !important 也改不动）
      const applyFont = () => {
        const svg = containerRef.current?.querySelector('svg');
        if (!svg) return;
        svg.querySelectorAll('text').forEach((t) => {
          t.setAttribute('font-family', GLOBAL_FONT_FAMILY);
        });
        // 关联线文字（在 <foreignObject> 内）
        svg.querySelectorAll('foreignObject *').forEach((el) => {
          (el as HTMLElement).style.fontFamily = GLOBAL_FONT_FAMILY;
        });
      };
      // 初次 + 任何 data 变化后都补一刀
      requestAnimationFrame(applyFont);
      instance.on('data_change', applyFont);
      instance.on('view_data_change', applyFont);

      // 居中显示，但不缩小整图（避免文字不可读）
      requestAnimationFrame(() => {
        if (!instance) return;
        try {
          instance.view.setScale?.(1);
          instance.view.reset?.();
        } catch {
          /* ignore */
        }
      });

      setEngineStatus('mindmap', 'ready');
      syncScale();
      setReady(true);
    });

    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      if (mindMapRef.current) {
        void storage.set(STORAGE_KEYS.MINDMAP, mindMapRef.current.getData(false));
      }
      instance?.destroy();
      mindMapRef.current = null;
      setReady(false);
    };
    // 仅初始化一次，主题/设置变化由下方 effect 处理
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 主题同步
  useEffect(() => {
    mindMapRef.current?.setThemeConfig(THEME_CONFIG[theme]);
  }, [theme, ready]);

  // 容器尺寸变化（窗口缩放、侧边栏展开收起）时重算布局
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      mindMapRef.current?.resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /** 立即落盘（setData 等程序化改动不会触发 data_change，需显式调用） */
  const flushSave = useCallback(() => {
    const mm = mindMapRef.current;
    if (!mm) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    void storage.set(STORAGE_KEYS.MINDMAP, mm.getData(false));
    markSaved('mindmap');
  }, [markSaved]);

  // 注册适配器
  useEffect(() => {
    const adapter: EngineAdapter = {
      save: flushSave,
      getScale: () => mindMapRef.current?.view.getTransformData().state.scale ?? null,
      zoomIn: () => mindMapRef.current?.view.enlarge(),
      zoomOut: () => mindMapRef.current?.view.narrow(),
      zoomReset: () => mindMapRef.current?.view.reset(),
      zoomFit: () => {
        // 用「缩放 + 居中」替代 smm 自带的 fit()，fit 在窄容器会把整图缩到文字不可读
        const mm = mindMapRef.current;
        if (!mm) return;
        try {
          mm.view.setScale?.(1);
          mm.view.reset?.();
        } catch {
          /* ignore */
        }
        containerRef.current
          ?.querySelectorAll('svg text')
          .forEach((t) => t.setAttribute('font-family', GLOBAL_FONT_FAMILY));
      },
      undo: () => mindMapRef.current?.execCommand('BACK'),
      redo: () => mindMapRef.current?.execCommand('FORWARD'),
      exportAs: async (format: ExportFormat) => {
        const mm = mindMapRef.current;
        if (!mm) {
          pushToast('error', '思维导图尚未就绪');
          return;
        }
        try {
          await mm.export(format, true, `drawhub-mindmap-${Date.now()}`);
          pushToast('success', `已导出 ${format.toUpperCase()}`);
        } catch (err) {
          console.error('[DrawHub] 思维导图导出失败', err);
          pushToast('error', `导出 ${format.toUpperCase()} 失败，请查看控制台`);
        }
      },
      importAs: async (format: ImportFormat, content: string | ArrayBuffer) => {
        const mm = mindMapRef.current;
        if (!mm) throw new Error('思维导图尚未就绪，请稍后重试');

        const asText = () =>
          typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);

        let data: any;
        if (format === 'json') {
          let parsed: unknown;
          try {
            parsed = JSON.parse(asText());
          } catch {
            throw new Error('JSON 解析失败，请选择思维导图导出的 JSON 文件');
          }
          const obj = parsed as { root?: unknown } | null;
          if (!obj || typeof obj !== 'object') throw new Error('不是有效的思维导图 JSON');
          // 兼容「带 root 包裹」与「裸根节点」两种常见形态
          const root = 'root' in obj ? obj.root : obj;
          if (!root || typeof root !== 'object' || Array.isArray(root)) {
            throw new Error('JSON 中未找到导图根节点');
          }
          data = root;
        } else if (format === 'md') {
          data = transformMarkdownTo(asText());
          if (!data) throw new Error('未能从 Markdown 中解析出标题或列表');
        } else if (format === 'xmind') {
          let buf: ArrayBuffer;
          if (content instanceof ArrayBuffer) {
            buf = content;
          } else {
            const bytes = new TextEncoder().encode(content);
            buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          }
          try {
            data = await xmindParser.parseXmindFile(buf);
          } catch (err) {
            console.error('[DrawHub] XMind 解析失败', err);
            throw new Error('XMind 解析失败，请确认文件未损坏');
          }
        } else {
          throw new Error(`思维导图不支持导入 ${format.toUpperCase()}`);
        }

        mm.setData(data);
        // 同样不用 fit()：导入后保持 1x + 居中，由用户自行滚轮缩放
        requestAnimationFrame(() => {
          try {
            mm.view.setScale?.(1);
            mm.view.reset?.();
          } catch {
            /* ignore */
          }
          containerRef.current
            ?.querySelectorAll('svg text')
            .forEach((t) => t.setAttribute('font-family', GLOBAL_FONT_FAMILY));
        });
        flushSave();
      },
    };
    registerAdapter('mindmap', adapter);
    return () => unregisterAdapter('mindmap');
  }, [registerAdapter, unregisterAdapter, pushToast, ready, flushSave]);

  const handleLayoutChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value;
    setLayout(next);
    mindMapRef.current?.setLayout(next);
  };

  return (
    <div className="mindmap-wrap">
      <div className="mm-toolbar">
        <span className="mm-label">结构</span>
        <select value={layout} onChange={handleLayoutChange}>
          {LAYOUT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="mm-tip">双击节点编辑 · Tab 添加子节点 · Enter 添加同级节点</span>
      </div>
      <div className="mm-canvas" ref={containerRef} />
      {!ready && <div className="engine-loading">正在读取本地存档…</div>}
    </div>
  );
}
