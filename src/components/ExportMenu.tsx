import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META } from '../constants';
import type { ExportFormat } from '../types';

/** 统一导出入口：按当前引擎提供其原生支持的格式 */
export default function ExportMenu() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const adapters = useAppStore((s) => s.adapters);
  const pushToast = useAppStore((s) => s.pushToast);

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const formats = ENGINE_META[activeEngine].exportFormats;
  const adapter = adapters[activeEngine];

  const handlePick = async (format: ExportFormat) => {
    setOpen(false);
    if (!adapter?.exportAs) {
      pushToast('info', '当前引擎尚未就绪');
      return;
    }
    try {
      await adapter.exportAs(format);
    } catch (err) {
      console.error('[DrawHub] 导出失败', err);
      pushToast('error', '导出失败，请查看控制台');
    }
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className={`btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="导出当前图表"
      >
        <Download size={14} /> 导出 <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu-drop">
          <div className="menu-title">{ENGINE_META[activeEngine].label}</div>
          {formats.map((f) => (
            <button key={f.value} className="menu-item" onClick={() => void handlePick(f.value)}>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
