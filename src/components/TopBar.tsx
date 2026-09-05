import { Moon, Sun, Info, Settings, Palette, PanelLeftClose, PanelLeftOpen, Save } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import ExportMenu from './ExportMenu';
import ImportMenu from './ImportMenu';

export default function TopBar() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setDialog = useAppStore((s) => s.setDialog);
  const saveActive = useAppStore((s) => s.saveActive);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          className="icon-btn"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}
        >
          {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
        <div className="topbar-brand">
          <div className="brand-logo">
            <Palette size={16} />
          </div>
          <span className="brand-name">DrawHub</span>
        </div>
      </div>

      <div className="topbar-actions">
        <button className="btn" onClick={() => void saveActive()} title="保存当前图表 (Ctrl/Cmd+S)">
          <Save size={14} /> 保存
        </button>
        <ImportMenu />
        <ExportMenu />
        <button
          className="icon-btn"
          title={theme === 'dark' ? '切换到亮色主题' : '切换到暗色主题'}
          onClick={toggleTheme}
        >
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button className="icon-btn" title="设置" onClick={() => setDialog('settings')}>
          <Settings size={16} />
        </button>
        <button className="icon-btn" title="关于 DrawHub" onClick={() => setDialog('about')}>
          <Info size={16} />
        </button>
      </div>
    </header>
  );
}
