import { useEffect } from 'react';
import type { EngineId } from '../types';
import { useAppStore } from '../store/useAppStore';

const ENGINE_HOTKEYS: Record<string, EngineId> = {
  '1': 'drawio',
  '2': 'excalidraw',
  '3': 'mindmap',
};

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

/** 全局快捷键：Ctrl/Cmd+S 保存、Ctrl/Cmd+B 侧边栏、Ctrl/Cmd+1/2/3 切换引擎 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      // 输入框内（如 draw.io 内嵌编辑器、设置表单）不劫持快捷键
      if (isTypingTarget(e.target)) return;

      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        void useAppStore.getState().saveActive();
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        useAppStore.getState().toggleSidebar();
        return;
      }

      const target = ENGINE_HOTKEYS[e.key];
      if (target) {
        e.preventDefault();
        useAppStore.getState().setEngine(target);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
