import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';

const ICONS = {
  success: <CheckCircle2 size={15} />,
  error: <AlertTriangle size={15} />,
  info: <Info size={15} />,
};

/** 全局轻提示：保存、导出、存储异常等反馈 */
export default function ToastHost() {
  const toasts = useAppStore((s) => s.toasts);
  const dismissToast = useAppStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-host">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.type}`}>
          <span className="toast-icon">{ICONS[t.type]}</span>
          <span className="toast-text">{t.message}</span>
          <button className="toast-close" onClick={() => dismissToast(t.id)} title="关闭">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}
