import { useEffect, useRef, useState } from 'react';
import { Upload, ChevronDown } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META } from '../constants';
import { pickFile, readAsArrayBuffer, readAsText } from '../utils/file';
import type { ImportFormat } from '../types';

/** 需要以二进制读取的导入格式（其余按 UTF-8 文本读取） */
const BINARY_FORMATS: ImportFormat[] = ['xmind'];

/** 统一导入入口：按当前引擎提供其支持的源格式，选择文件后交给引擎适配器 */
export default function ImportMenu() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const adapters = useAppStore((s) => s.adapters);
  const pushToast = useAppStore((s) => s.pushToast);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const formats = ENGINE_META[activeEngine].importFormats;
  const adapter = adapters[activeEngine];

  const handlePick = async (format: ImportFormat, accept: string, label: string) => {
    setOpen(false);
    if (!adapter?.importAs) {
      pushToast('info', '当前引擎尚未就绪');
      return;
    }
    const file = await pickFile(accept);
    if (!file) return; // 用户取消

    setBusy(true);
    try {
      const content = BINARY_FORMATS.includes(format)
        ? await readAsArrayBuffer(file)
        : await readAsText(file);
      await adapter.importAs(format, content, file.name);
      pushToast('success', `已导入 ${file.name}`);
    } catch (err) {
      console.error('[DrawHub] 导入失败', err);
      const detail = err instanceof Error ? err.message : '请查看控制台';
      pushToast('error', `${label}导入失败：${detail}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="menu-wrap" ref={wrapRef}>
      <button
        className={`btn${open ? ' active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title="导入外部文件到当前引擎"
      >
        <Upload size={14} /> {busy ? '导入中…' : '导入'} <ChevronDown size={13} />
      </button>
      {open && (
        <div className="menu-drop">
          <div className="menu-title">{ENGINE_META[activeEngine].label}</div>
          {formats.map((f) => (
            <button
              key={f.value}
              className="menu-item"
              onClick={() => void handlePick(f.value, f.accept, f.label)}
            >
              {f.label}
            </button>
          ))}
          <div className="menu-note">导入会覆盖当前画布内容</div>
        </div>
      )}
    </div>
  );
}
