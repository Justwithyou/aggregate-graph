import { useAppStore } from '../store/useAppStore';
import { ENGINE_META } from '../constants';
import { formatBytes } from '../utils/download';

function formatTime(ts: number | null): string {
  if (!ts) return '尚未保存';
  const d = new Date(ts);
  return `已保存 ${d.toLocaleTimeString('zh-CN', { hour12: false })}`;
}

const STATUS_TEXT: Record<string, string> = {
  idle: '未激活',
  loading: '加载中…',
  ready: '就绪',
  error: '加载失败',
};

export default function StatusBar() {
  const activeEngine = useAppStore((s) => s.activeEngine);
  const engineStatus = useAppStore((s) => s.engineStatus);
  const lastSaved = useAppStore((s) => s.lastSaved);
  const storageUsage = useAppStore((s) => s.storageUsage);
  const settings = useAppStore((s) => s.settings);

  const status = engineStatus[activeEngine];
  const meta = ENGINE_META[activeEngine];

  return (
    <footer className="statusbar">
      <span className="status-item">{meta.label}</span>
      <span className={`status-dot${status === 'ready' ? ' ok' : status === 'error' ? ' err' : ''}`} />
      <span className="status-item">{STATUS_TEXT[status] ?? status}</span>
      <span className="status-sep" />
      <span className="status-item">{formatTime(lastSaved[activeEngine])}</span>
      <span className="status-sep" />
      <span className="status-item" title="本地已占用的存储大小">
        本地数据 {formatBytes(storageUsage?.total ?? 0)}
      </span>
      <span className="status-sep" />
      <span className="status-item" title="自动保存防抖时长">
        自动保存 {Math.round(settings.autosaveDelay / 100) / 10}s
      </span>
      <span className="status-spacer" />
      <span className="status-item status-hint">
        {activeEngine === 'drawio'
          ? 'Ctrl/Cmd+S 保存 · draw.io 快捷键由引擎接管'
          : 'Ctrl/Cmd+S 保存 · Ctrl/Cmd+1/2/3 切换引擎'}
      </span>
    </footer>
  );
}
