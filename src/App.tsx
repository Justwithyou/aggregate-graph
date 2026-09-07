import { Suspense, lazy, useEffect, useState } from 'react';
import type { ComponentType, LazyExoticComponent } from 'react';
import type { EngineId } from './types';
import { ENGINE_META } from './constants';
import { useAppStore } from './store/useAppStore';
import TopBar from './components/TopBar';
import CanvasBar from './components/CanvasBar';
import Sidebar from './components/Sidebar';
import StatusBar from './components/StatusBar';
import ToastHost from './components/ToastHost';
import SettingsDialog from './components/dialogs/SettingsDialog';
import AboutDialog from './components/dialogs/AboutDialog';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';

/**
 * 引擎组件按需加载。
 *
 * 三大引擎（尤其 Excalidraw 与 simple-mind-map full.js）体积很大，
 * 若全部打进首屏，入口 JS 会到数 MB 级。这里改为访问到哪个引擎才加载哪个，
 * 首屏只需下载应用外壳；已加载过的引擎不会重复请求。
 */
const ENGINE_COMPONENTS: Record<EngineId, LazyExoticComponent<ComponentType>> = {
  drawio: lazy(() => import('./components/engines/DrawIOView')),
  excalidraw: lazy(() => import('./components/engines/ExcalidrawView')),
  mindmap: lazy(() => import('./components/engines/MindMapView')),
};

const ENGINE_IDS: EngineId[] = ['drawio', 'excalidraw', 'mindmap'];

function EngineLoading({ engine }: { engine: EngineId }) {
  return (
    <div className="engine-loading">
      <div className="engine-loading__inner">
        <span className="engine-loading__spinner" aria-hidden="true" />
        <span>正在加载 {ENGINE_META[engine].short} …</span>
      </div>
    </div>
  );
}

export default function App() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const theme = useAppStore((s) => s.theme);
  const uiFont = useAppStore((s) => s.settings.uiFont ?? 'hand');
  const activeDialog = useAppStore((s) => s.activeDialog);
  const refreshUsage = useAppStore((s) => s.refreshUsage);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const initFiles = useAppStore((s) => s.initFiles);
  // 首次访问的引擎才挂载，之后保持挂载以保留各引擎状态
  const [visited, setVisited] = useState<EngineId[]>([]);

  useGlobalShortcuts();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // 界面字体：hand = excalifont 手写体（默认，拉丁字符），system/sans/serif/kai 分别对应
  // 系统 UI / 黑体 / 宋体 / 楷体（中文友好）。通过 <html data-font> 切换，
  // global.css 里 :root[data-font='...'] 覆盖 --font。
  useEffect(() => {
    document.documentElement.setAttribute('data-font', uiFont);
  }, [uiFont]);

  // 本地文件目录树：读取索引，必要时把旧的单键存档迁移为默认文件
  useEffect(() => {
    void initFiles().then(() => void refreshUsage());
  }, [initFiles, refreshUsage]);

  // file:// 下宿主来源为 null，本地存储与嵌入引擎都会失效，启动时明确告知
  useEffect(() => {
    if (window.location.protocol !== 'file:') return;
    useAppStore
      .getState()
      .pushToast(
        'error',
        '当前以 file:// 打开，本地存储不可用。请用 npm run dev 或 npm run preview 启动',
      );
  }, []);

  // 切走的引擎恢复为 idle，避免状态栏残留上一个引擎的加载态
  useEffect(() => {
    ENGINE_IDS.forEach((id) => {
      if (id !== activeEngine) {
        const s = useAppStore.getState().engineStatus[id];
        if (s === 'loading') setEngineStatus(id, 'idle');
      }
    });
  }, [activeEngine, setEngineStatus]);

  useEffect(() => {
    setVisited((prev) => (prev.includes(activeEngine) ? prev : [...prev, activeEngine]));
  }, [activeEngine]);

  // 存储用量：启动时统计，之后定期刷新（保存后由引擎触发 markSaved，这里做兜底轮询）
  useEffect(() => {
    void refreshUsage();
    const timer = window.setInterval(() => void refreshUsage(), 30000);
    return () => window.clearInterval(timer);
  }, [refreshUsage]);

  return (
    <div className="app">
      <TopBar />
      <div className="app-body">
        <Sidebar />
        <div className="app-content">
          <CanvasBar />
          <main className="app-main">
            {ENGINE_IDS.map((id) => {
              if (!visited.includes(id)) return null;
              const Engine = ENGINE_COMPONENTS[id];
              return (
                <div
                  key={id}
                  className="engine-pane"
                  data-active={activeEngine === id ? 'true' : 'false'}
                  style={{ visibility: activeEngine === id ? 'visible' : 'hidden' }}
                >
                  <Suspense fallback={<EngineLoading engine={id} />}>
                    <Engine />
                  </Suspense>
                </div>
              );
            })}
          </main>
        </div>
      </div>
      <StatusBar />
      <ToastHost />
      {activeDialog === 'settings' && <SettingsDialog />}
      {activeDialog === 'about' && <AboutDialog />}
    </div>
  );
}
