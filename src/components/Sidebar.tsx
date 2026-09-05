import type { ReactNode } from 'react';
import { Workflow, PenTool, Network, Settings, Info } from 'lucide-react';
import type { EngineId } from '../types';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META, ENGINE_ORDER } from '../constants';

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

  return (
    <aside className={`sidebar${collapsed ? ' collapsed' : ''}`}>
      <nav className="sidebar-list">
        {ENGINE_ORDER.map((id) => {
          const status = engineStatus[id];
          return (
            <button
              key={id}
              className={`side-item${activeEngine === id ? ' active' : ''}`}
              onClick={() => setEngine(id)}
              title={collapsed ? `${ENGINE_META[id].label} (${HOTKEYS[id]})` : HOTKEYS[id]}
            >
              <span className="side-icon">{ICONS[id]}</span>
              {!collapsed && (
                <span className="side-text">
                  <span className="side-label">{ENGINE_META[id].label}</span>
                  <span className="side-desc">{ENGINE_META[id].desc}</span>
                </span>
              )}
              <span className={`side-dot ${status}`} title={STATUS_TEXT[status] ?? status} />
            </button>
          );
        })}
      </nav>

      <div className="sidebar-foot">
        <button
          className={`side-item${collapsed ? '' : ''}`}
          onClick={() => setDialog('settings')}
          title="设置"
        >
          <span className="side-icon">
            <Settings size={17} />
          </span>
          {!collapsed && (
            <span className="side-text">
              <span className="side-label">设置</span>
            </span>
          )}
        </button>
        <button className="side-item" onClick={() => setDialog('about')} title="关于">
          <span className="side-icon">
            <Info size={17} />
          </span>
          {!collapsed && (
            <span className="side-text">
              <span className="side-label">关于</span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
}
