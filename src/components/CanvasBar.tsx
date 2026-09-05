import { Undo2, Redo2, Minus, Plus, Maximize2 } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META } from '../constants';

const STATUS_TEXT: Record<string, string> = {
  idle: '未激活',
  loading: '加载中…',
  ready: '就绪',
  error: '未就绪',
};

/**
 * 画布工具条。
 *
 * 原先这里同时承载「引擎 Tab 切换」，与左侧导航重复。切换职责已全部交给侧边栏，
 * 本条只保留与当前画布直接相关的操作：撤销 / 重做 / 缩放，以及当前引擎的状态。
 */
export default function CanvasBar() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const adapters = useAppStore((s) => s.adapters);
  const engineStatus = useAppStore((s) => s.engineStatus);
  const scale = useAppStore((s) => s.scale);

  const adapter = adapters[activeEngine];
  const currentScale = scale[activeEngine];
  const zoomable = Boolean(adapter?.zoomIn);
  const status = engineStatus[activeEngine];
  const meta = ENGINE_META[activeEngine];

  return (
    <div className="canvasbar">
      <div className="canvasbar-left">
        <span className={`canvasbar-dot ${status}`} />
        <span className="canvasbar-name">{meta.label}</span>
        <span className="canvasbar-status">{STATUS_TEXT[status] ?? status}</span>
        <span className="canvasbar-desc">{meta.desc}</span>
      </div>

      <div className="canvasbar-tools">
        <button className="tool-btn" disabled={!adapter?.undo} onClick={adapter?.undo} title="撤销">
          <Undo2 size={15} />
        </button>
        <button className="tool-btn" disabled={!adapter?.redo} onClick={adapter?.redo} title="重做">
          <Redo2 size={15} />
        </button>
        <span className="tool-divider" />
        <button
          className="tool-btn"
          disabled={!zoomable}
          onClick={adapter?.zoomOut}
          title="缩小"
        >
          <Minus size={15} />
        </button>
        <span className="zoom-label">{currentScale ? `${Math.round(currentScale * 100)}%` : '—'}</span>
        <button className="tool-btn" disabled={!zoomable} onClick={adapter?.zoomIn} title="放大">
          <Plus size={15} />
        </button>
        <button
          className="tool-btn"
          disabled={!adapter?.zoomFit}
          onClick={adapter?.zoomFit}
          title="适应画布"
        >
          <Maximize2 size={15} />
        </button>
      </div>
    </div>
  );
}
