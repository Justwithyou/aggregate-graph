import type { EngineId, ExportFormat, ImportFormat } from './types';

/** draw.io 官方嵌入地址（需联网） */
export const DEFAULT_DRAWIO_URL = 'https://embed.diagrams.net/';

/**
 * 嵌入模式固定参数。
 * embed=1 嵌入模式；proto=json 使用 JSON 消息协议；libraries=1 保留图形库侧栏。
 * 注意：自动保存不在此处 —— autosave 是 load 消息的字段（见 DrawIOView），URL 参数无效。
 * math 亦由设置项 drawioMath 控制（默认关闭以省下约 2MB 下载）。
 */
export const DRAWIO_EMBED_PARAMS =
  'embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&saveAndExit=0&math=0';

export interface EngineMeta {
  label: string;
  short: string;
  desc: string;
  exportFormats: { value: ExportFormat; label: string }[];
  /** 可导入的格式；accept 用于文件选择器的扩展名过滤 */
  importFormats: { value: ImportFormat; label: string; accept: string }[];
}

/** 引擎元信息：Tab / 侧边栏 / 状态栏 / 导出菜单共用 */
export const ENGINE_META: Record<EngineId, EngineMeta> = {
  drawio: {
    label: 'draw.io 图表',
    short: 'draw.io',
    desc: '专业图表 · UML / 架构图 / 流程图',
    exportFormats: [
      { value: 'png', label: 'PNG 图片' },
      { value: 'svg', label: 'SVG 矢量图' },
      { value: 'xml', label: 'draw.io XML（源文件）' },
    ],
    importFormats: [
      { value: 'xml', label: 'draw.io 文件（.drawio / .xml）', accept: '.drawio,.xml' },
    ],
  },
  excalidraw: {
    label: 'Excalidraw 白板',
    short: 'Excalidraw',
    desc: '手绘白板 · 自由涂鸦 / 原型草图',
    exportFormats: [
      { value: 'png', label: 'PNG 图片' },
      { value: 'svg', label: 'SVG 矢量图' },
      { value: 'json', label: 'Excalidraw JSON（源文件）' },
    ],
    importFormats: [
      {
        value: 'json',
        label: 'Excalidraw 场景（.excalidraw / .json）',
        accept: '.excalidraw,.json',
      },
    ],
  },
  mindmap: {
    label: '思维导图',
    short: '思维导图',
    desc: '结构化表达 · 8 种布局 / 多种导出',
    exportFormats: [
      { value: 'png', label: 'PNG 图片' },
      { value: 'svg', label: 'SVG 矢量图' },
      { value: 'pdf', label: 'PDF 文档' },
      { value: 'md', label: 'Markdown' },
      { value: 'json', label: 'JSON 数据' },
      { value: 'xmind', label: 'XMind 文件' },
    ],
    importFormats: [
      { value: 'json', label: '思维导图 JSON（.json）', accept: '.json,.smm' },
      { value: 'md', label: 'Markdown 大纲（.md）', accept: '.md,.markdown,.txt' },
      { value: 'xmind', label: 'XMind 文件（.xmind）', accept: '.xmind' },
    ],
  },
};

export const ENGINE_ORDER: EngineId[] = ['drawio', 'excalidraw', 'mindmap'];

/** 默认设置 */
export const DEFAULT_SETTINGS = {
  drawioBaseUrl: DEFAULT_DRAWIO_URL,
  /** 是否启用 draw.io 数学公式（MathJax），开启会增加约 2MB 首次加载 */
  drawioMath: false,
  autosaveDelay: 600,
  sidebarCollapsed: false,
};
