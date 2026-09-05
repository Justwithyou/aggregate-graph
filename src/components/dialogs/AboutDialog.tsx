import { Palette } from 'lucide-react';
import Modal from '../Modal';
import { useAppStore } from '../../store/useAppStore';
import { ENGINE_META, ENGINE_ORDER } from '../../constants';

const SHORTCUTS = [
  { keys: ['Ctrl', 'S'], desc: '保存当前图表' },
  { keys: ['Ctrl', '1 / 2 / 3'], desc: '切换三大引擎' },
  { keys: ['Ctrl', 'B'], desc: '展开 / 收起侧边栏' },
];

export default function AboutDialog() {
  const setDialog = useAppStore((s) => s.setDialog);

  return (
    <Modal title="关于 DrawHub" onClose={() => setDialog(null)} width={480}>
      <div className="about-hero">
        <div className="brand-logo lg">
          <Palette size={22} />
        </div>
        <div>
          <h3>DrawHub v0.1.0</h3>
          <p>把最成熟的绘图引擎聚合在同一个界面里的本地绘图工具。</p>
        </div>
      </div>

      <section className="form-section">
        <h3>集成引擎</h3>
        <ul className="engine-list">
          {ENGINE_ORDER.map((id) => (
            <li key={id}>
              <strong>{ENGINE_META[id].label}</strong>
              <span>{ENGINE_META[id].desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="form-section">
        <h3>快捷键</h3>
        <ul className="shortcut-list">
          {SHORTCUTS.map((s) => (
            <li key={s.desc}>
              <kbd>{s.keys[0]}</kbd> + <kbd>{s.keys[1]}</kbd>
              <span>{s.desc}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="form-hint">
        全部数据保存在浏览器本地（localStorage + IndexedDB），无数据库、无网络上传。
        draw.io 以嵌入方式加载，需要访问其在线服务；Excalidraw 与思维导图可完全离线使用。
      </p>
    </Modal>
  );
}
