/** 引擎标识 */
export type EngineId = 'drawio' | 'excalidraw' | 'mindmap';

/** 主题模式 */
export type ThemeMode = 'light' | 'dark';

/** 引擎加载状态 */
export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

/** 各引擎对外暴露的导出格式 */
export type ExportFormat = 'png' | 'svg' | 'xml' | 'json' | 'md' | 'pdf' | 'xmind' | 'txt';

/** 各引擎可接受的导入格式 */
export type ImportFormat = 'xml' | 'json' | 'md' | 'xmind';

/**
 * 引擎适配器：由各引擎组件在挂载时注册，
 * 供顶栏命令区、全局快捷键等"胶水层"统一调度。
 * 引擎不支持的能力直接不实现，UI 会自动置灰。
 */
export interface EngineAdapter {
  save: () => void | Promise<void>;
  exportAs?: (format: ExportFormat) => void | Promise<void>;
  /**
   * 把外部文件内容载入当前引擎。
   * content 为文本（xml/json/md）或二进制（xmind）；实现方需自行校验内容合法性，
   * 校验失败时抛出带有用户可读信息的 Error，由调用方统一转为 Toast。
   */
  importAs?: (format: ImportFormat, content: string | ArrayBuffer, filename: string) => void | Promise<void>;
  zoomIn?: () => void;
  zoomOut?: () => void;
  zoomReset?: () => void;
  zoomFit?: () => void;
  undo?: () => void;
  redo?: () => void;
  /** 当前缩放比例（1 = 100%），用于状态栏展示；null 表示引擎未提供 */
  getScale?: () => number | null;
}

/** 应用设置（持久化在 localStorage） */
export interface AppSettings {
  /** draw.io 嵌入地址，可替换为自托管实例以支持内网/离线 */
  drawioBaseUrl: string;
  /** 自动保存防抖时长（毫秒） */
  autosaveDelay: number;
  /** 侧边栏是否折叠 */
  sidebarCollapsed: boolean;
  /**
   * draw.io 是否预加载公式排版（MathJax）。
   * 关闭可少下载约 2MB / 7 个请求，首次进入明显更快；
   * 用到数学公式图形时需重新开启。
   */
  drawioMath: boolean;
}

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
}

export type DialogId = 'settings' | 'about' | null;
