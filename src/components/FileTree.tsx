import { useMemo, useState } from 'react';
import {
  ChevronRight,
  FilePlus2,
  Pencil,
  Save,
  Trash2,
  FileCode2,
  FileJson,
  FolderOpen,
} from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { ENGINE_META, ENGINE_ORDER } from '../constants';
import type { EngineId } from '../types';

/** 相对时间：文件量大时比绝对时间更好扫 */
function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 本地文件目录树。
 *
 * 按引擎分组展示保存在本地（IndexedDB）的全部文件：
 * - 单击行 = 打开（切换引擎并把内容载入画布）
 * - 悬停出现 ✎ 重命名 / 🗑 删除（删除需二次确认）
 * - 顶部 + 新建空白文件、⤓ 把当前画布另存为新文件
 */
export default function FileTree() {
  const files = useAppStore((s) => s.files);
  const activeFileId = useAppStore((s) => s.activeFileId);
  const activeEngine = useAppStore((s) => s.activeEngine);
  const openFile = useAppStore((s) => s.openFile);
  const createFile = useAppStore((s) => s.createFile);
  const renameFile = useAppStore((s) => s.renameFile);
  const deleteFile = useAppStore((s) => s.deleteFile);
  const saveActiveAs = useAppStore((s) => s.saveActiveAs);

  const [collapsed, setCollapsed] = useState<Record<EngineId, boolean>>({
    drawio: false,
    excalidraw: false,
    mindmap: false,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const grouped = useMemo(() => {
    return ENGINE_ORDER.map((engine) => ({
      engine,
      items: files
        .filter((f) => f.engine === engine)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }));
  }, [files]);

  const commitRename = async (id: string) => {
    const name = draftName.trim();
    setEditingId(null);
    if (!name) return;
    await renameFile(id, name);
  };

  return (
    <div className="file-panel">
      <div className="file-panel__head">
        <span className="file-panel__title">文件</span>
        <div className="file-panel__ops">
          <button
            className="file-mini-btn"
            title={`新建${ENGINE_META[activeEngine].short}文件`}
            onClick={() => void createFile(activeEngine)}
          >
            <FilePlus2 size={14} />
          </button>
          <button
            className="file-mini-btn"
            title="将当前画布另存为新文件"
            onClick={() => void saveActiveAs()}
          >
            <Save size={14} />
          </button>
        </div>
      </div>

      <div className="file-panel__list">
        {grouped.map(({ engine, items }) => {
          const isOpen = !collapsed[engine];
          return (
            <div key={engine}>
              <button
                className="file-group"
                onClick={() => setCollapsed((c) => ({ ...c, [engine]: !c[engine] }))}
                title={ENGINE_META[engine].desc}
              >
                <span className={`file-group__chevron${isOpen ? ' open' : ''}`}>
                  <ChevronRight size={13} />
                </span>
                <span className="file-group__name">{ENGINE_META[engine].short}</span>
                <span className="file-group__count">{items.length}</span>
              </button>

              {isOpen &&
                items.map((f) => {
                  const isActive = activeFileId[f.engine] === f.id;
                  const isEditing = editingId === f.id;
                  return (
                    <div
                      key={f.id}
                      className={`file-row${isActive ? ' active' : ''}`}
                      onClick={() => {
                        if (isEditing || pendingDelete === f.id) return;
                        void openFile(f.id);
                      }}
                      title={`${f.name} · ${ENGINE_META[f.engine].short} · ${formatRelative(f.updatedAt)}`}
                    >
                      {f.format === 'xml' ? <FileCode2 size={13} /> : <FileJson size={13} />}

                      {isEditing ? (
                        <input
                          className="file-row__input"
                          value={draftName}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => setDraftName(e.target.value)}
                          onBlur={() => void commitRename(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void commitRename(f.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                      ) : (
                        <span className="file-row__name">{f.name}</span>
                      )}

                      {pendingDelete === f.id ? (
                        <span className="file-row__confirm" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setPendingDelete(null);
                              void deleteFile(f.id);
                            }}
                          >
                            删除
                          </button>
                          <button className="ghost" onClick={() => setPendingDelete(null)}>
                            取消
                          </button>
                        </span>
                      ) : (
                        <span className="file-row__ops" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="file-mini-btn"
                            title="重命名"
                            onClick={() => {
                              setDraftName(f.name);
                              setEditingId(f.id);
                            }}
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            className="file-mini-btn"
                            title="删除"
                            onClick={() => setPendingDelete(f.id)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}

              {isOpen && items.length === 0 && (
                <div className="file-empty">
                  暂无文件
                  <button
                    className="link-btn"
                    onClick={() => void createFile(engine)}
                    style={{ marginLeft: 4 }}
                  >
                    新建
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {files.length === 0 && (
          <div className="file-empty">
            <FolderOpen size={14} /> 还没有任何本地文件
          </div>
        )}
      </div>
    </div>
  );
}
