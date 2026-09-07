import { useEffect, useRef, useState } from 'react';
import { Download, Upload, Trash2, RotateCcw } from 'lucide-react';
import Modal from '../Modal';
import { useAppStore } from '../../store/useAppStore';
import { storage, type StorageSnapshot } from '../../services/storage';
import { DEFAULT_DRAWIO_URL, FONT_OPTIONS } from '../../constants';
import { downloadText, formatBytes, stampName } from '../../utils/download';

const AUTOSAVE_OPTIONS = [
  { value: 300, label: '0.3 秒（更实时，写入更频繁）' },
  { value: 600, label: '0.6 秒（推荐）' },
  { value: 1500, label: '1.5 秒（更省资源）' },
  { value: 3000, label: '3 秒（低频写入）' },
];

export default function SettingsDialog() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const setDialog = useAppStore((s) => s.setDialog);
  const pushToast = useAppStore((s) => s.pushToast);
  const refreshUsage = useAppStore((s) => s.refreshUsage);
  const storageUsage = useAppStore((s) => s.storageUsage);

  const [urlDraft, setUrlDraft] = useState(settings.drawioBaseUrl);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const handleExportBackup = async () => {
    try {
      const snapshot = await storage.exportSnapshot();
      downloadText(
        JSON.stringify(snapshot, null, 2),
        stampName('drawhub-backup', 'json'),
        'application/json',
      );
      pushToast('success', '备份已导出');
    } catch (err) {
      console.error('[DrawHub] 备份导出失败', err);
      pushToast('error', '备份导出失败');
    }
  };

  const handleImportBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as StorageSnapshot;
      await storage.importSnapshot(parsed);
      pushToast('success', '备份已恢复，即将刷新应用');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('[DrawHub] 备份恢复失败', err);
      pushToast('error', '备份恢复失败：文件格式不正确');
    }
  };

  const handleClear = async () => {
    try {
      await storage.clearAll();
      pushToast('success', '本地数据已清空，即将刷新应用');
      window.setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      console.error('[DrawHub] 清空失败', err);
      pushToast('error', '清空失败');
    }
  };

  const close = () => setDialog(null);

  return (
    <Modal title="设置" onClose={close} width={600}>
      <section className="form-section">
        <h3>通用</h3>
        <label className="form-row">
          <span>自动保存间隔</span>
          <select
            value={settings.autosaveDelay}
            onChange={(e) => updateSettings({ autosaveDelay: Number(e.target.value) })}
          >
            {AUTOSAVE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row">
          <span>界面字体</span>
          <select
            value={settings.uiFont ?? 'hand'}
            onChange={(e) =>
              updateSettings({ uiFont: e.target.value as typeof settings.uiFont })
            }
          >
            {FONT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <p className="form-hint">
          所有引擎的编辑都会按该间隔防抖写入本地存储；切换引擎、关闭应用前也会强制落盘。
        </p>
      </section>

      <section className="form-section">
        <h3>draw.io 引擎</h3>
        <label className="form-row">
          <span>嵌入地址</span>
          <input
            type="text"
            value={urlDraft}
            spellCheck={false}
            placeholder={DEFAULT_DRAWIO_URL}
            onChange={(e) => setUrlDraft(e.target.value)}
          />
        </label>
        <div className="form-actions">
          <button
            className="btn primary"
            onClick={() => {
              updateSettings({ drawioBaseUrl: urlDraft.trim() || DEFAULT_DRAWIO_URL });
              pushToast('success', '已应用，draw.io 正在重新加载');
            }}
          >
            应用
          </button>
          <button
            className="btn"
            onClick={() => {
              setUrlDraft(DEFAULT_DRAWIO_URL);
              updateSettings({ drawioBaseUrl: DEFAULT_DRAWIO_URL });
            }}
          >
            <RotateCcw size={13} /> 恢复官方地址
          </button>
        </div>
        <p className="form-hint">
          draw.io 以 iframe 嵌入方式接入，默认依赖官方在线服务（需联网）。在内网或离线环境可自行部署
          draw.io 后填入地址，例如 <code>http://localhost:20003/</code>。
        </p>
      </section>

      <section className="form-section">
        <h3>数据管理</h3>
        <div className="usage-line">
          当前本地占用：<strong>{formatBytes(storageUsage?.total ?? 0)}</strong>
          {storageUsage?.quota ? (
            <span className="muted">（浏览器配额约 {formatBytes(storageUsage.quota)}）</span>
          ) : null}
        </div>
        <div className="form-actions">
          <button className="btn" onClick={() => void handleExportBackup()}>
            <Download size={13} /> 导出备份
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            <Upload size={13} /> 导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportBackup(file);
              e.target.value = '';
            }}
          />
          {confirmingClear ? (
            <span className="confirm-inline">
              确定清空全部本地数据？
              <button className="btn danger" onClick={() => void handleClear()}>
                确认清空
              </button>
              <button className="btn" onClick={() => setConfirmingClear(false)}>
                取消
              </button>
            </span>
          ) : (
            <button className="btn danger" onClick={() => setConfirmingClear(true)}>
              <Trash2 size={13} /> 清空数据
            </button>
          )}
        </div>
        <p className="form-hint">
          备份文件为单个 JSON，包含三大引擎的全部内容与偏好设置，可用于迁移或版本回退。
        </p>
      </section>

      <section className="form-section">
        <h3>快捷键</h3>
        <ul className="shortcut-list">
          <li>
            <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>S</kbd>
            <span>保存当前图表</span>
          </li>
          <li>
            <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd>
            <span>切换 draw.io / Excalidraw / 思维导图</span>
          </li>
          <li>
            <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>B</kbd>
            <span>展开 / 收起侧边栏</span>
          </li>
        </ul>
        <p className="form-hint">
          画布内部的快捷键（如 draw.io 的对齐、思维导图的 Tab / Enter）由各引擎自身接管。
        </p>
      </section>
    </Modal>
  );
}
