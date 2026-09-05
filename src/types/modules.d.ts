/**
 * simple-mind-map 的 full.js 入口（注册了全部插件：Export/Drag/Select/RichText 等）
 * 该子路径无独立类型声明，这里补充本项目使用到的 API 类型。
 */
declare module 'simple-mind-map/full.js' {
  export default class MindMap {
    constructor(opt?: Record<string, any>);
    el: HTMLElement;
    opt: Record<string, any>;
    on(event: string, fn: (...args: any[]) => void): void;
    off(event: string, fn: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
    destroy(): void;

    /** 获取当前导图数据；withConfig=false 时不带主题/布局等配置 */
    getData(withConfig?: boolean): any;
    setData(data: any): void;
    setFullData(data: any): void;
    updateData(data: any): void;

    setLayout(layout: string, notRender?: boolean): void;
    getLayout(): string;
    setTheme(theme: string, notRender?: boolean): void;
    setThemeConfig(config: Record<string, any>, notRender?: boolean): void;
    updateConfig(opt?: Record<string, any>): void;

    /** 执行内置命令，如 BACK（撤销）/ FORWARD（重做）/ INSERT_NODE */
    execCommand(...args: any[]): void;

    /** 容器尺寸变化后重算布局 */
    resize(): void;

    /** 导出；type 支持 png / svg / pdf / json / md / txt / xmind */
    export(...args: any[]): Promise<any>;

    view: {
      /** 当前变换状态，state.scale 即缩放比例 */
      getTransformData(): { transform: any; state: { scale: number; x: number; y: number } };
      reset(): void;
      enlarge(cx?: number, cy?: number, isTouchPad?: boolean): void;
      narrow(cx?: number, cy?: number, isTouchPad?: boolean): void;
      setScale(scale: number, cx?: number, cy?: number): void;
      fit(getRbox?: () => any, enlarge?: boolean, fitPadding?: number): void;
    };
  }
}

/**
 * simple-mind-map 的解析模块（Markdown / XMind → 导图数据）。
 * 这两个是源码子路径，包内未提供类型声明，这里按需补充。
 */
declare module 'simple-mind-map/src/parse/markdownTo.js' {
  /** 把 Markdown 的标题层级与列表转换为导图节点树；无有效内容时返回 undefined */
  export const transformMarkdownTo: (md: string) => any | undefined;
}

declare module 'simple-mind-map/src/parse/xmind.js' {
  /** 解析 .xmind 压缩包，返回导图节点数据 */
  interface XmindParser {
    parseXmindFile: (file: ArrayBuffer | Blob) => Promise<any>;
    transformXmind: (content: string, files: any, handleMultiCanvas?: any) => Promise<any>;
    transformToXmind: (data: any, name: string) => Promise<Blob>;
  }
  const parser: XmindParser;
  export default parser;
}
