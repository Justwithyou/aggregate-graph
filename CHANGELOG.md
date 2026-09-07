# Changelog

本项目所有版本变更记录。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.4.0] - 2026-09-07

### 新增

- **本地文件目录树**：三大引擎的多文档管理，支持新建 / 打开 / 重命名 / 删除。索引存 `localStorage`（启动即用、同步读取），内容存 `IndexedDB`（单图可达数 MB）；旧的单键存档自动迁移为默认文件，历史内容可继续打开。删掉某引擎最后一个文件时自动补一个空文件，避免自动保存无处可写。
- **多界面字体切换**：`excalifont` 手写体仅覆盖拉丁字符，新增 `system`（Assistant / 系统 UI）、`sans`（黑体）、`serif`（宋体）、`kai`（楷体）等中文友好字体族，顶栏「字体」下拉与设置面板均可切换，通过 `<html data-font>` 即时生效、无需重新加载。

### 变更

- 顶栏「字体」按钮改为下拉菜单（原为二态循环切换）。
- 版本号 0.3.5 → 0.4.0；README 版本徽章同步，新增「本地文件目录树」特性说明，路线图「多文档 / 文件树」改为已完成。

### 修复

- 切换引擎后 Excalidraw 自带的左下角「缩放」操作条会串到 draw.io / 思维导图视图上；非当前引擎时隐藏该面板，缩放统一走顶栏工具条。

## [0.3.5] - 2026-09-04

### 修复

- **思维导图节点文字无法显示**：根因是 simple-mind-map 库在 `.smm-richtext-node-wrap` 内用 `<p>` 渲染文字，而 `<p>` 浏览器默认 `margin: 16px`，把内容挤出 `foreignObject`（库按单行 ~20px 计算高度）。在 `src/styles/global.css` 中新增 CSS reset，统一清零富文本节点中 p / ol / ul / pre / blockquote / h1~h6 的默认 margin 与 padding。
- 缩放适配 / 导入后重新排版改为 `setScale(1) + view.reset()`，避免再被 `view.fit()` 覆盖。
- 字体应用改为「渲染后遍历 svg `<text>` 强制覆盖 font-family」，统一苹果风格字体全局生效。

### 变更

- 思维导图初始化关闭 `isFitViewOnInit`。
- 版本号 0.3.1 → 0.3.5。

## [0.3.4] - 2026-09-04

### 新增

- **POC 对比页** `poc/mindmap-compare.html`：本地 vendor 自包含 simple-mind-map / MindElixir UMD 资源，常驻 `python -m http.server 20100 --bind 0.0.0.0`，不再依赖远端 CDN。
- **思维导图引擎替换方案** [`docs/思维导图引擎替换方案.md`](docs/思维导图引擎替换方案.md)：6 个候选引擎逐项打分，结论迁移至 `mind-elixir-core`，附数据归一表、`EngineAdapter` 设计与 4 阶段计划。
- **未来功能升级** [`docs/未来功能升级.md`](docs/未来功能升级.md)：F-01 ~ F-10 按近期 / 中期 / 远期分类。
- 设计文档新增版本记录章节，README 路线图改近/中/远期三段。

## [0.3.1] - 2026-09-02

### 初始化

- 项目骨架：React 19 + TypeScript 5.9 + Vite（Rolldown）。
- 三引擎聚合：
  - **draw.io**：iframe 嵌入 + postMessage 双向 JSON 字符串协议，`load` 消息体 `autosave: 1` 开启自动保存。
  - **Excalidraw**：React 组件直渲染，懒加载分包。
  - **simple-mind-map**：纯 JS 实例，懒加载分包。
- **EngineAdapter 适配器模式**：`save` / `exportAs` / `importAs` / `zoomIn` / `zoomOut` / `undo` / `redo` 等接口统一，顶栏与快捷键面向接口编程。
- Zustand 全局状态 + 引擎注册表。
- **统一存储**：localStorage 同步读写小数据，>256KB 自动转 IndexedDB，配额超限主动提示，支持整库快照导出/导入。
- 顶栏 / 侧边栏 / 画布工具条 / 状态栏 / Toast / 设置 / 导入导出菜单。
- 亮 / 暗主题，毛玻璃（glassmorphism）视觉风格。
- Tauri v2 桌面端配置（`src-tauri/`）。
- MIT License。