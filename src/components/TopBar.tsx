import { useEffect, useRef, useState } from 'react';
import {
  Moon,
  Sun,
  Info,
  Settings,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  Save,
  Type,
  FolderTree,
  ChevronDown,
  Check,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { FONT_OPTIONS } from '../constants';
import type { UiFont } from '../types';
import ExportMenu from './ExportMenu';
import ImportMenu from './ImportMenu';

function fontLabel(v: UiFont) {
  return FONT_OPTIONS.find((o) => o.value === v)?.label ?? '字体';
}

export default function TopBar() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const setDialog = useAppStore((s) => s.setDialog);
  const saveActive = useAppStore((s) => s.saveActive);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const saveActiveAs = useAppStore((s) => s.saveActiveAs);

  const uiFont = settings.uiFont ?? 'hand';
  const filesPanelOpen = settings.filesPanelOpen ?? true;

  const [fontOpen, setFontOpen] = useState(false);
  const fontWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!fontOpen) return;
    const onDown = (e: MouseEvent) => {
      if (fontWrapRef.current && !fontWrapRef.current.contains(e.target as Node)) setFontOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFontOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [fontOpen]);

  const setFont = (v: UiFont) => {
    updateSettings({ uiFont: v });
    setFontOpen(false);
  };

  const toggleFiles = () => {
    const next = !filesPanelOpen;
    // 面板打开时若侧边栏处于收起态，顺手展开，否则用户看不到变化
    if (next && sidebarCollapsed) toggleSidebar();
    updateSettings({ filesPanelOpen: next });
  };

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
        <button
          className="btn"
          onClick={() => void saveActiveAs()}
          title="将当前画布另存为一个新的本地文件"
        >
          另存为
        </button>
        <ImportMenu />
        <ExportMenu />
        <button
          className={`icon-btn${filesPanelOpen ? ' active' : ''}`}
          title={filesPanelOpen ? '隐藏本地文件面板' : '显示本地文件面板'}
          onClick={toggleFiles}
        >
          <FolderTree size={16} />
        </button>

        {/* 界面字体下拉：excalifont 仅覆盖拉丁字符，中文可切黑体 / 宋体 / 楷体 */}
        <div className="menu-wrap" ref={fontWrapRef}>
          <button
            className="btn"
            onClick={() => setFontOpen((v) => !v)}
            title={`界面字体：${fontLabel(uiFont)}`}
          >
            <Type size={14} /> {fontLabel(uiFont)} <ChevronDown size={13} />
          </button>
          {fontOpen && (
            <div className="menu-drop menu-drop--font">
              <div className="menu-title">界面字体</div>
              {FONT_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  className="menu-item menu-item--font"
                  data-selected={o.value === uiFont}
                  onClick={() => setFont(o.value)}
                >
                  <span className="menu-item__main">
                    <span>{o.label}</span>
                    <span className="menu-item__hint">{o.hint}</span>
                  </span>
                  {o.value === uiFont && <Check size={14} className="menu-item__check" />}
                </button>
              ))}
            </div>
          )}
        </div>

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
