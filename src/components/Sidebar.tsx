import type { ReactNode } from 'react';
import { Workflow, PenTool, Network, Settings, Info } from 'lucide-react';
import type { EngineId } from '../types';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META, ENGINE_ORDER } from '../constants';
import { useMediaQuery, NARROW_QUERY } from '../hooks/useMediaQuery';
import FileTree from './FileTree';

const ICONS: Record<EngineId, ReactNode> = {
  drawio: <Workflow size={17} />,
  excalidraw: <PenTool size={17} />,
  mindmap: <Network size={17} />,
};

const HOTKEYS: Record<EngineId, string> = {
  drawio: 'Ctrl+1',
  excalidraw: 'Ctrl+2',
  mindmap: 'Ctrl+3',
};

const STATUS_TEXT: Record<string, string> = {
  idle: '未加载',
  loading: '加载中',
  ready: '就绪',
  error: '加载失败',
};

/** 左侧引擎导航：与顶部 Tab 双向同步，可折叠为图标条 */
export default function Sidebar() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const setEngine = useAppStore((s) => s.setEngine);
  const engineStatus = useAppStore((s) => s.engineStatus);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const setDialog = useAppStore((s) => s.setDialog);
  const filesPanelOpen = useAppStore((s) => s.settings.filesPanelOpen);
  const files = useAppStore((s) => s.files);
  const activeFileId = useAppStore((s) => s.activeFileId);

  // 浏览器放大 / 窗口变窄时 CSS 视口会缩小，此时与手动收起一样只显示图标
  const narrow = useMediaQuery(NARROW_QUERY);
  const iconOnly = collapsed || narrow;

  const currentFileName = files.find((f) => f.id === activeFileId[activeEngine])?.name;

  return (
    <aside
      className={`sidebar${collapsed ? ' collapsed' : ''}${narrow ? ' compact' : ''}`}
      data-icon-only={iconOnly ? 'true' : 'false'}
    >
      <nav className="sidebar-list">
        {ENGINE_ORDER.map((id) => {
          const status = engineStatus[id];
          const statusText = STATUS_TEXT[status] ?? status;
          return (
            <button
              key={id}
              className={`side-item${activeEngine === id ? ' active' : ''}`}
              onClick={() => setEngine(id)}
              title={
                iconOnly
                  ? `${ENGINE_META[id].label} · ${statusText} (${HOTKEYS[id]})`
                  : `${ENGINE_META[id].label} · ${statusText} · ${HOTKEYS[id]}`
              }
            >
              <span className="side-icon">{ICONS[id]}</span>
              {!iconOnly && (
                <span className="side-text">
                  <span className="side-label">{ENGINE_META[id].label}</span>
                  <span className="side-desc">{ENGINE_META[id].desc}</span>
                </span>
              )}
              {!iconOnly && (
                <span className={`side-dot ${status}`} title={statusText} />
              )}
            </button>
          );
        })}
      </nav>

      {!iconOnly && filesPanelOpen && <FileTree />}

      <div className="sidebar-foot">
        <button className="side-item" onClick={() => setDialog('settings')} title="设置">
          <span className="side-icon">
            <Settings size={17} />
          </span>
          {!iconOnly && (
            <span className="side-text">
              <span className="side-label">设置</span>
            </span>
          )}
        </button>
        <button className="side-item" onClick={() => setDialog('about')} title="关于">
          <span className="side-icon">
            <Info size={17} />
          </span>
          {!iconOnly && (
            <span className="side-text">
              <span className="side-label">关于</span>
            </span>
          )}
        </button>
        {!iconOnly && currentFileName && (
          <div className="sidebar-current" title={`当前文件：${currentFileName}`}>
            {currentFileName}
          </div>
        )}
      </div>
    </aside>
  );
}
