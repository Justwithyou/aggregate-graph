import type { EngineId, ExportFormat, ImportFormat, UiFont } from './types';

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
  /** 界面字体：excalifont 手写体（hand）默认 */
  uiFont: 'hand' as UiFont,
  /** 侧边栏本地文件目录树 */
  filesPanelOpen: true,
};

/** 界面字体选项：顶栏「字体」下拉与设置面板共用 */
export const FONT_OPTIONS: { value: UiFont; label: string; hint: string }[] = [
  { value: 'hand', label: 'excalifont 手写体', hint: '拉丁字符手写风，中文回退系统字体' },
  { value: 'system', label: '系统默认 / Assistant', hint: '极简 UI 字体' },
  { value: 'sans', label: '黑体（中文无衬线）', hint: '苹方 / 微软雅黑 / Noto Sans SC' },
  { value: 'serif', label: '宋体（中文衬线）', hint: '宋体 / 思源宋体 / Georgia' },
  { value: 'kai', label: '楷体（中文手写）', hint: '楷体 / 华文楷体' },
];

/** 每个引擎在文件树里的内容格式 */
export const ENGINE_FILE_FORMAT: Record<EngineId, 'xml' | 'json'> = {
  drawio: 'xml',
  excalidraw: 'json',
  mindmap: 'json',
};

/** 每个引擎新建文件时的默认命名前缀 */
export const ENGINE_FILE_PREFIX: Record<EngineId, string> = {
  drawio: '未命名图表',
  excalidraw: '未命名白板',
  mindmap: '未命名导图',
};
