# DrawHub 设计文档

> 聚合性本地绘图工具：draw.io / Excalidraw / 思维导图（simple-mind-map）
> 版本：v0.3.2 ｜ 最后更新：2026-09-04

---

## 1. 背景

### 1.1 问题

用户在绘图场景中通常需要多种能力：专业图表（UML、架构图、ER 图）、手绘白板、思维导图。这些能力分散在不同的工具中，用户需要在多个应用之间来回切换、维护多套数据，体验割裂。

### 1.2 核心思路

DrawHub 不做"自研绘图引擎"，而是做**胶水层（glue layer）**：把业界最成熟的三大绘图引擎聚合到同一个界面中，通过顶部 Tab 或侧边栏一键切换，统一管理数据持久化、主题、快捷键与导出。

### 1.3 目标

1. 聚合 draw.io（专业图表）、Excalidraw（手绘白板）、simple-mind-map（思维导图）三大引擎
2. 纯前端、零数据库、数据保存在浏览器本地（localStorage + IndexedDB 分层）
3. 最终可打包为跨平台桌面应用（Tauri v2），安装包体积小（<20MB）

### 1.4 参考项目

- AI Draw Nexus（https://github.com/hkxiaoyao/ai-draw-nexus）——同类"聚合绘图"思路参考
- 同类开源项目清单见 [7. 参考 → 同类开源项目](#7-参考)

---

## 2. 架构

### 2.1 总体架构

```
+------------------------------------------------------------------+
|  TopBar（Logo / 主题切换 / 设置 / 关于）                           |
+------------------+-----------------------------------------------+
|  Sidebar         |  TabNav（draw.io ｜ Excalidraw ｜ 思维导图）   |
|  （可折叠）       +-----------------------------------------------+
|  引擎入口        |                 app-main                       |
|  存储用量        |  +-------------+ +-----------+ +-------------+ |
|                  |  | DrawIOView  | | Excali-   | | MindMapView | |
|                  |  | iframe +    | | drawView  | | simple-     | |
|                  |  | postMessage | | React组件 | | mind-map    | |
|                  |  +-------------+ +-----------+ +-------------+ |
|                  |  引擎采用"首次访问才挂载 + visibility 隐藏"策略  |
+------------------+-----------------------------------------------+
|  StatusBar（当前模式 │ 就绪状态 │ 缩放 │ 上次保存 │ 提示）         |
+------------------------------------------------------------------+
|  ToastHost（操作反馈）           Modal（设置 / 关于）              |
+------------------------------------------------------------------+
          │
          ▼
  useAppStore (Zustand) ──► storage 服务 ──► localStorage + IndexedDB
```

### 2.2 分层职责

| 层 | 模块 | 职责 |
|----|------|------|
| 展示层 | `App.tsx`、`TopBar`、`Sidebar`、`TabNav`、`StatusBar` | 布局与交互壳 |
| 通用组件层 | `Modal`、`ToastHost`、`ExportMenu`、`dialogs/*` | 弹窗、提示、统一导出菜单 |
| 引擎层 | `components/engines/*View.tsx` | 各绘图引擎集成 + 注册 `EngineAdapter` |
| 状态层 | `store/useAppStore.ts`（Zustand） | 当前引擎、主题、适配器、缩放、Toast、设置、存储用量 |
| 服务层 | `services/storage.ts`、`services/idb.ts` | 统一异步存储：localStorage + IndexedDB 分层、快照导出/导入 |
| 工具层 | `hooks/useGlobalShortcuts.ts`、`utils/download.ts` | 全局快捷键、文件下载 |

### 2.3 引擎集成机制（三种模式）

| 引擎 | 集成方式 | 数据格式 | 通信机制 |
|------|----------|----------|----------|
| draw.io | iframe 嵌入 `embed.diagrams.net` | XML | `postMessage`（`init`/`load`/`save`/`autosave`/`export` 事件） |
| Excalidraw | React 组件直接嵌入 | JSON（elements + appState + files） | `onChange` 回调 + `excalidrawAPI` 命令式调用 |
| 思维导图 | 类库实例挂载到 DOM 容器 | JSON（节点树） | 实例事件（`data_change`/`view_data_change`）+ `execCommand` |

### 2.4 引擎适配器（EngineAdapter）

三大引擎能力差异很大，胶水层通过统一接口抹平差异。各引擎组件挂载时注册适配器，卸载时注销：

```ts
export interface EngineAdapter {
  save: () => void | Promise<void>;                  // 必选
  exportAs?: (format: ExportFormat) => void | Promise<void>;
  importAs?: (format: ImportFormat, content: string | ArrayBuffer) => void | Promise<void>;
  zoomIn?: () => void;
  zoomOut?: () => void;
  zoomReset?: () => void;
  zoomFit?: () => void;
  undo?: () => void;
  redo?: () => void;
  getScale?: () => number | null;                    // 供状态栏显示缩放比例
}
```

**关键约定**：引擎不支持的能力直接不实现，UI 自动置灰对应按钮。这样新增第四、第五个引擎时，胶水层代码零改动。

各引擎支持情况：

| 能力 | draw.io | Excalidraw | 思维导图 |
|------|---------|------------|----------|
| 保存 | ✅ | ✅ | ✅ |
| 导出 | PNG / SVG / XML | PNG / SVG / JSON | PNG / SVG / PDF / MD / JSON / XMind |
| 导入 | XML | JSON 场景 | JSON / Markdown / XMind |
| 缩放控制 | 由 draw.io 自身处理 | ✅ | ✅ |
| 撤销/重做 | 由 draw.io 自身处理 | 由 Excalidraw 自身处理 | ✅（BACK / FORWARD 命令） |
| 缩放比例回传 | — | ✅ | ✅ |

**导入契约**：`content` 由胶水层统一读取（文本格式给 `string`，XMind 给 `ArrayBuffer`），引擎只负责解析与校验。解析失败时抛出带中文说明的 `Error`，胶水层统一转成失败 Toast，绝不把堆栈抛给用户。

### 2.5 状态管理（Zustand）

`useAppStore` 维护：

- `activeEngine`：当前激活引擎（`drawio`/`excalidraw`/`mindmap`）
- `theme`：亮色/暗色主题（持久化）
- `engineStatus`：各引擎加载状态（`idle`/`loading`/`ready`/`error`）
- `lastSaved`：各引擎上次保存时间戳
- `adapters`：各引擎注册的 `EngineAdapter`
- `scale`：各引擎当前缩放比例（状态栏展示）
- `settings`：应用设置（draw.io 地址、自动保存防抖、侧边栏折叠）
- `toasts` / `activeDialog`：反馈与弹窗
- `storageUsage`：本地存储占用估算

关键机制：

1. **保存分发**：`saveActive()` 取当前引擎的适配器执行 `save()`，成功则 `markSaved()` + Toast 提示，失败则捕获异常并提示。
2. **存储错误上浮**：`storage.onError()` 订阅存储层异常（尤其是 `QuotaExceededError`），统一转成用户可见的错误 Toast，避免"静默丢数据"。
3. **设置即持久化**：`updateSettings()` 写入 localStorage 的同时更新内存状态；`toggleSidebar()` 复用同一通道，侧边栏折叠状态天然持久化。

### 2.6 引擎按需加载（代码分割）

三大引擎体积差异极大，全部打进首屏会让入口 JS 达到数 MB。因此：

- `App.tsx` 用 `React.lazy(() => import('./components/engines/XxxView'))` 加载引擎组件，外层包 `Suspense`，加载期间显示带引擎名的转圈占位。
- 引擎组件只在**首次访问时**才发起网络请求，已加载过的不会重复下载。
- 与"状态保留"策略配合：懒加载只影响"何时下载"，不影响"下载后一直挂载"，因此切换 Tab 依然零重建。

> 踩坑记录：不要用 `manualChunks` 给引擎单独指定 chunk 名。Rolldown 会把 `__vitePreload` 之类的共享辅助函数塞进那个 chunk，导致入口反向静态依赖它，引擎 chunk 被写进 `index.html` 的 `modulepreload`，懒加载直接失效（实测首屏会回到数 MB）。引擎的拆分交给 `React.lazy` 的动态 import 驱动即可，`manualChunks` 只用来拆首屏本来就要加载的公共依赖。

实测产物体积：

| 阶段 | 加载内容 | 体积 | gzip |
|------|----------|------|------|
| 首屏（任何引擎都需要） | entry + vendor-react + vendor-icons + CSS | **231.8 KB** | 73.5 KB |
| 访问 draw.io 时 | DrawIOView chunk | +6.0 KB | 2.5 KB |
| 访问 Excalidraw 时 | ExcalidrawView chunk（+ 其内部按需 chunk） | +1070.4 KB | 334.0 KB |
| 访问思维导图时 | MindMapView chunk（+ katex / cytoscape 等按需） | +1332.7 KB | 434.6 KB |

优化前首屏为 2974.6 KB（gzip 951.4 KB），优化后 **231.8 KB，降幅 92%**。只用 draw.io 的用户完全不必为另外两个引擎买单。

### 2.7 引擎状态保留策略

`App.tsx` 维护 `visited` 数组：只有首次访问过的引擎才挂载，之后通过 CSS `visibility`（非 `display:none`）隐藏非激活引擎的容器。这样切换 Tab 时**不销毁**引擎实例，Excalidraw 画布、draw.io iframe、思维导图布局均保持原状态。

> 注意：用 `visibility` 而非 `display:none`，是因为 Excalidraw 与 simple-mind-map 在容器尺寸为 0 时会产生错误的布局计算。

### 2.7 数据流（以思维导图为例）

```
用户在画布编辑
   │  simple-mind-map 触发 data_change / view_data_change
   ▼
persist() → storage.set(KEY.MINDMAP, getData(false)) → localStorage / IndexedDB
   │
Ctrl+S  → saveActive() → adapters.mindmap.save() → persist() + markSaved() + Toast
```

---

## 3. 技术栈

| 层面 | 选型 | 版本 | 说明 |
|------|------|------|------|
| 前端框架 | React + TypeScript | React 19.2.8 / TS 5.9.3 | 主流、生态成熟 |
| 构建工具 | Vite | 8.2.2 | `base: './'` 支持 file:// 直开与 Tauri 打包 |
| 绘图引擎1 | draw.io（embed.diagrams.net） | 在线版 | iframe + postMessage 协议 |
| 绘图引擎2 | @excalidraw/excalidraw | 0.18.1 | 官方 React 组件 |
| 绘图引擎3 | simple-mind-map | 0.13.1 | 纯 JS 库，无框架依赖，使用 `full.js` 完整版 |
| 状态管理 | Zustand | 5.0.15 | 轻量 |
| 图标 | lucide-react | 1.39.0 | 图标库 |
| 桌面打包 | Tauri v2 | CLI 2.11.4 / Rust crate 2 | 体积小 |
| 数据存储 | localStorage + IndexedDB | 浏览器原生 | 零数据库 |

**开发工具链**：Node 22.23.2、npm 12.0.2；桌面构建需 Rust + VS Build Tools。

---

## 4. 功能

### 4.1 布局结构

```
+-------------------------------------------+
|  [Logo]  DrawHub    [主题] [设置] [关于]    |  ← 顶栏
+---------+---------------------------------+
| Sidebar |  📊 draw.io  ✏️ Excalidraw  🧠 思维导图 |  ← 侧边栏 + Tab
| （折叠） +---------------------------------+
|         |            绘图区域               |  ← 主区域
+---------+---------------------------------+
|  当前模式 │ 状态 │ 缩放 │ 上次保存 │ 提示    |  ← 状态栏
+-------------------------------------------+
```

### 4.2 draw.io 图表

- iframe 嵌入 `{baseUrl}/?embed=1&proto=json&spin=1&libraries=1&noExitBtn=1&saveAndExit=0`
- 监听 `init` 事件后加载已保存 XML（无则加载内置默认示例画布）
- 监听 `save`/`autosave`/`export` 事件，将最新 XML 持久化
- **主题同步**：暗色模式下追加 `ui=dark&dark=1` 参数，重新加载 iframe 生效
- **地址可配置**：设置中可替换 baseUrl 为自托管实例，支持内网/离线部署
- **加载超时降级**：iframe 迟迟未触发 `init` 时标记为 `error`，提供重试按钮
- 支持 draw.io 全量图表能力：UML、架构图、ER 图、流程图、泳道图等

### 4.3 Excalidraw 白板

- 官方 React 组件直接嵌入，提供手绘风格白板体验
- `onChange` 回调 + 防抖自动保存（默认 600ms，可在设置中调整）
- **appState 裁剪**：只持久化 `viewBackgroundColor`、`currentItem*`、网格、缩放等必要字段，剥离协作者、选中态、弹窗等瞬态字段，显著减小存储体积
- **文件（图片）一并持久化**：`BinaryFiles` 随场景保存，刷新后嵌入图片不丢失
- **主题同步**：`theme` prop + 背景色切换，导出时按主题决定是否使用深色模式
- 导出：PNG（含背景、2x 缩放）/ SVG / JSON 源文件

### 4.4 思维导图

- simple-mind-map 实例挂载到容器，默认逻辑结构图
- 支持 8 种布局切换：逻辑结构图、向左逻辑结构、思维导图、组织结构图、目录组织图、时间轴、竖向时间轴、鱼骨图
- 监听 `data_change` / `view_data_change` 自动持久化
- **撤销/重做**：通过 `execCommand('BACK')` / `execCommand('FORWARD')` 接入统一命令栏
- **缩放控制**：放大/缩小/重置/适应画布，并回传缩放比例到状态栏
- **resize 适配**：`ResizeObserver` 监听容器变化并调用 `instance.resize()`
- **深色主题**：内置 default 主题仅适配亮色，通过 `setThemeConfig` 覆盖节点/连线/背景色
- 导出：PNG / SVG / PDF / Markdown / JSON / XMind

### 4.5 数据持久化

统一 `storage` 服务，**分层存储**：

| 键 | 内容 | 典型层级 |
|----|------|----------|
| `drawhub_drawio_xml` | draw.io 图表 XML | 小 → localStorage；>256KB → IndexedDB |
| `drawhub_excalidraw` | Excalidraw elements + appState + files | 同上 |
| `drawhub_mindmap` | 思维导图节点树 JSON | 同上 |
| `drawhub_theme` | 主题模式 | localStorage（同步读，启动即需） |
| `drawhub_settings` | 应用设置 | localStorage（同步读） |

分层策略：

1. **同步 API**（`getSync`/`setSync`/`getRawSync`/`setRawSync`）：仅用于主题、设置这类启动即需的小数据。
2. **异步 API**（`get`/`set`/`getRaw`/`setRaw`）：引擎数据走异步通道，写入时若超过 256KB 阈值自动转存 IndexedDB 并清理 localStorage 副本，避免双写脏数据；IndexedDB 不可用时自动退化为 localStorage。
3. **读取顺序**：localStorage → IndexedDB，天然兼容历史数据。

数据管理能力：

- `usage()`：估算各键占用与浏览器配额，侧边栏/状态栏展示
- `exportSnapshot()` / `importSnapshot()`：全量数据导出为 JSON 备份、从备份恢复
- `clearAll()`：清空全部本地数据
- `onError()`：配额超限等异常统一上报，转成用户可见 Toast

所有数据仅存本地，无网络上传、无数据库服务。

### 4.6 主题切换

- 顶栏按钮切换亮色/暗色，持久化到 localStorage，重启保持
- 通过 `data-theme` 属性驱动整体 CSS
- Excalidraw：通过 `theme` prop + 背景色同步
- 思维导图：通过 `setThemeConfig` 覆盖节点/连线/背景色
- draw.io：通过嵌入参数 `ui=dark&dark=1` 同步（切换时重载 iframe）

### 4.7 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + S` | 保存当前引擎图表（按引擎路由到对应适配器） |
| `Ctrl/Cmd + 1` | 切换到 draw.io |
| `Ctrl/Cmd + 2` | 切换到 Excalidraw |
| `Ctrl/Cmd + 3` | 切换到思维导图 |
| `Ctrl/Cmd + B` | 折叠/展开侧边栏 |

快捷键在输入框（`INPUT`/`TEXTAREA`/`contentEditable`）内自动让行，避免劫持 draw.io 内嵌编辑器的原生快捷键。

### 4.8 统一导出菜单

顶栏导出按钮按当前引擎动态渲染可选格式（见 2.4 表格），点击后调用对应适配器的 `exportAs(format)`，统一走 `utils/download.ts` 触发浏览器下载，文件名带时间戳。引擎不支持的格式不会出现，避免"点了没反应"。

### 4.9 统一导入菜单

顶栏导入按钮镜像导出菜单：按当前引擎渲染其支持的源格式，选择文件后由 `utils/file.ts` 统一读取，再分发给 `importAs(format, content)`。

| 引擎 | 可导入格式 | 解析方式 |
|------|-----------|---------|
| draw.io | `.drawio` / `.xml` | 校验根节点为 `<mxfile>`，通过 postMessage `load` 载入 |
| Excalidraw | `.excalidraw` / `.json` | 官方 `restore()` 补齐元素默认值与箭头绑定，再 `updateScene` + `addFiles` |
| 思维导图 | `.json` / `.md` / `.xmind` | JSON 兼容「带 root 包裹」与「裸根节点」；Markdown 走 `transformMarkdownTo`；XMind 走 `parseXmindFile` |

设计要点：

1. **文件选择器用完即弃**：`pickFile()` 动态创建 `<input type="file">` 并在 `change` 后移除，避免各引擎常驻一个隐藏 input。
2. **二进制与文本分流**：仅 XMind 走 `ArrayBuffer`（zip 压缩包），其余按 UTF-8 文本读取。
3. **导入即覆盖**：菜单底部明确提示，避免用户误以为会追加。
4. **失败可读**：格式不符、JSON 损坏、XMind 解析异常都转成具体中文原因，而不是堆栈。

### 4.10 设置 / 关于

设置对话框：

- draw.io 嵌入地址（支持自托管）
- 自动保存防抖时长
- 数据管理：查看存储占用、导出备份、导入备份、清空数据

关于对话框：版本、技术栈、快捷键说明、开源协议。

### 4.11 状态栏

展示当前模式、引擎就绪状态（状态点）、当前缩放比例、上次保存时间、操作提示，实时反馈用户操作。

### 4.12 响应式

- 窗口最小尺寸 900×600（桌面端）
- 主区域自适应填满剩余空间，引擎画布 100% 宽高
- 侧边栏可折叠，窄屏下自动收起为图标条

---

## 5. 运行 / 打包 / 部署

### 5.1 本地开发

端口约定：本项目统一使用 **200xx** 端口段，端口被占用时顺延到下一个可用值。

| 用途 | 端口 | 配置位置 | 监听地址 |
|------|------|----------|----------|
| Vite 开发服务器 | 20001 | `vite.config.ts` → `server.port` | `0.0.0.0` |
| 生产预览 | 20002 | `vite.config.ts` → `preview.port` | `0.0.0.0` |
| draw.io 自托管（可选） | 20003 | 仅离线/内网部署时用到 | 由 draw.io 决定 |

**监听地址说明**：`server.host` 与 `preview.host` 均设为 `true`（监听 `0.0.0.0`）。Vite 默认值只绑定 `localhost`，而 Node 17+ 会把 `localhost` 优先解析为 IPv6 回环 `::1`，表现为「`localhost` 能打开、用本机局域网 IP 访问不了」。设为 `true` 后启动时会额外打印 Network 地址（如 `http://192.168.x.x:20001/`），可供局域网内其他设备访问。

```bash
npm install        # 安装依赖
npm run dev        # 启动 Vite 开发服务器，默认 http://localhost:20001
```

> 局域网其他设备访问不通时，检查 Windows 防火墙是否放行对应端口：
> `New-NetFirewallRule -DisplayName "DrawHub Dev 20001" -Direction Inbound -LocalPort 20001 -Protocol TCP -Action Allow`（管理员权限）

### 5.2 生产构建

```bash
npm run build      # tsc --noEmit 类型检查 + vite build → dist/
npm run preview    # 本地预览构建产物（http://localhost:20002）
```

> 未设置 `strictPort`，端口被占用时 Vite 自动顺延，实际地址以终端输出为准。

`vite.config.ts` 设置 `base: './'`，使 `dist/` 可通过 `file://` 协议直接打开，兼顾离线使用与 Tauri 打包。

### 5.3 桌面打包（Tauri v2）

前置条件：

1. 安装 [Rust](https://rustup.rs/)（rustc + cargo）
2. Windows 安装 [Visual Studio Build Tools](https://aka.ms/vs/17/release/vs_BuildTools.exe)（含 MSVC 与 Windows SDK）
3. 系统需具备 WebView2（Windows 10/11 通常已内置）

构建命令：

```bash
npm run tauri dev     # 开发模式（桌面窗口 + HMR）
npm run tauri build   # 生产打包 → .exe / .dmg / .AppImage
```

Tauri 配置要点（`src-tauri/tauri.conf.json`）：

- `build.beforeDevCommand: "npm run dev"`、`devUrl: http://localhost:20001`（需与 `vite.config.ts` 的 `server.port` 保持一致）
- `build.beforeBuildCommand: "npm run build"`、`frontendDist: ../dist`
- `identifier: com.drawhub.app`、窗口 1280×800（最小 900×600）
- `bundle.icon`：由 `npm run tauri icon assets/icon-source.png` 生成的全套图标

当前环境状态（`tauri info` 诊断）：

- ✅ WebView2 已安装
- ✅ @tauri-apps/cli 2.11.4、tauri.conf.json 配置解析通过
- ❌ 未安装 Rust / Cargo / VS Build Tools → 需安装后才能执行 `tauri build`

### 5.4 目录结构

```
aggregate-graph/
├── src/
│   ├── components/
│   │   ├── engines/
│   │   │   ├── DrawIOView.tsx      # draw.io iframe 集成
│   │   │   ├── ExcalidrawView.tsx  # Excalidraw React 组件集成
│   │   │   └── MindMapView.tsx     # simple-mind-map 集成
│   │   ├── dialogs/
│   │   │   ├── SettingsDialog.tsx  # 设置（draw.io 地址/自动保存/数据管理）
│   │   │   └── AboutDialog.tsx     # 关于
│   │   ├── TopBar.tsx              # 顶栏
│   │   ├── Sidebar.tsx             # 可折叠侧边栏
│   │   ├── TabNav.tsx              # Tab 导航
│   │   ├── ExportMenu.tsx          # 统一导出菜单
│   │   ├── ImportMenu.tsx          # 统一导入菜单
│   │   ├── Modal.tsx               # 通用弹窗
│   │   ├── ToastHost.tsx           # 全局提示
│   │   └── StatusBar.tsx           # 状态栏
│   ├── hooks/
│   │   └── useGlobalShortcuts.ts   # 全局快捷键
│   ├── services/
│   │   ├── storage.ts              # 统一存储服务（localStorage + IndexedDB）
│   │   └── idb.ts                  # IndexedDB 极简封装
│   ├── store/
│   │   └── useAppStore.ts          # Zustand 状态管理
│   ├── styles/global.css           # 全局样式
│   ├── types/
│   │   └── modules.d.ts            # simple-mind-map/full.js 类型声明
│   ├── utils/
│   │   ├── download.ts             # 文件下载工具
│   │   └── file.ts                 # 文件选择与读取（导入用）
│   ├── App.tsx / main.tsx / types.ts / constants.ts
├── src-tauri/                      # Tauri 桌面端
│   ├── src/main.rs / lib.rs        # Rust 入口
│   ├── tauri.conf.json / Cargo.toml / build.rs
│   ├── capabilities/default.json   # 能力权限
│   └── icons/                      # 全套应用图标
├── assets/icon-source.png          # 图标源图
├── docs/DrawHub 设计文档.md
├── vite.config.ts / tsconfig.json / package.json
```

---

## 6. 风险

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| draw.io 嵌入依赖网络（`embed.diagrams.net`） | 首次加载、离线时无法使用 draw.io 图表 | 支持自定义自托管地址；加载超时检测 + 重试；Excalidraw/思维导图不受影响 |
| iframe 跨域限制 | draw.io 内部无法完全跟随全局暗色主题 | 通过嵌入参数 `ui=dark&dark=1` 同步；残留差异受跨域限制无法彻底消除 |
| localStorage 容量限制（约 5MB） | 大型图表可能超出配额 | **已缓解**：>256KB 自动转存 IndexedDB；配额异常转为用户提示；支持导出备份后清理 |
| Excalidraw 场景含大量图片时体积膨胀 | 存储与加载变慢 | appState 裁剪 + 大对象自动转 IndexedDB + 防抖写入 |
| Tauri 构建环境依赖 | 未装 Rust / VS Build Tools 无法打包 | 文档给出前置安装步骤（本段上文） |
| simple-mind-map 导出 PNG/PDF/XMind 依赖完整版（full.js） | 产物体积增大 | 已按需使用 full.js，未做按需加载；后续可改为动态 import 拆包 |
| 浏览器兼容性 | Excalidraw 对低版本浏览器不友好 | 桌面端使用内置 WebView2，版本受控 |
| 导入文件与当前画布不兼容 | 用户误导入后内容被覆盖 | 导入前菜单明确提示「导入会覆盖当前画布内容」；格式校验失败不改动画布 |

### 6.1 开源协议

| 组件 | 协议 | 说明 |
|------|------|------|
| draw.io | Apache-2.0 | 嵌入其官方在线服务 |
| @excalidraw/excalidraw | MIT | 可自由使用 |
| simple-mind-map | MIT（以仓库 LICENSE 为准） | 可自由使用 |
| Tauri | MIT / Apache-2.0 双许可 | 可自由使用 |

---

## 7. 参考

### 项目参考

- AI Draw Nexus：https://github.com/hkxiaoyao/ai-draw-nexus
- DrawHub 源码：`d:\work\workspace\trae-work\aggregate-graph`

### 同类开源项目

> 横向对比与选型参考。思维导图部分列出了 simple-mind-map 之外的替代库（详见风险 §6 与后续规划 §9 的替换评估）。

**聚合绘图 / 白板**

- [tldraw](https://github.com/tldraw/tldraw) — 开源白板 / 图表引擎，React 原生、可扩展性强
- [AI Draw Nexus](https://github.com/hkxiaoyao/ai-draw-nexus) — 同类「聚合绘图」思路参考

**图表**

- [draw.io](https://github.com/jgraph/drawio) — 最强大的开源图表工具（DrawHub 已集成）
- [Mermaid](https://github.com/mermaid-js/mermaid) — 文本驱动的图表生成
- [D2](https://github.com/terrastruct/d2) — 声明式图表语言

**白板 / 手绘**

- [Excalidraw](https://github.com/excalidraw/excalidraw) — 手绘风虚拟白板（DrawHub 已集成）

**思维导图**

| 项目 | 定位 | 特点 | 与 simple-mind-map 对比 |
|------|------|------|------------------------|
| [simple-mind-map](https://github.com/wanglin2/mind-map) | 功能最全 | 结构多、插件丰富、支持 XMind | 当前使用；体积大、字体写死需手动覆盖 |
| [mind-elixir-core](https://github.com/ssshooter/mind-elixir-core) | 内核级、框架无关 | 约 15KB gzip、性能好、插件化 | 更轻量；功能不如 simple-mind-map 全 |
| [markmap](https://github.com/markmap/markmap) | Markdown → 导图 | 轻量美观、自动布局 | 只读为主，编辑能力弱 |
| [jsmind](https://github.com/hizzgdev/jsmind) | 老牌经典 | 稳定、依赖少 | 样式较旧、可定制性有限 |
| [butterfly](https://github.com/alibaba/butterfly) | 节点编排 / 流程图 | 可自定义节点实现导图 | 需二次开发，非开箱即用 |

### 官方文档

- draw.io Embed Mode：https://www.drawio.com/doc/faq/embed-mode
- Excalidraw：https://github.com/excalidraw/excalidraw
- simple-mind-map：https://github.com/wanglin2/mind-map
- Tauri v2：https://v2.tauri.app/
- Zustand：https://github.com/pmndrs/zustand
- Vite：https://vite.dev/

### 环境依赖

- Rust：https://rustup.rs/
- VS Build Tools：https://aka.ms/vs/17/release/vs_BuildTools.exe

---

## 8. 版本记录

### v0.3.5（2026-09-04）

- 修复思维导图「节点文字无法显示」（只剩残影）Bug：
  - 根因：simple-mind-map 把节点文字渲染进 `<div class="smm-richtext-node-wrap"><p>…</p></div>`，而浏览器给 `<p>` 的默认上下 margin（各约 16px）未被 reset。引擎按 `foreignObject` 高度（单行约 20px）计算节点盒子，不含 `<p>` 的 margin，导致文字被 margin 挤出 foreignObject 区域而被裁剪，肉眼见「文字只剩顶部/底部残影」
  - 修复：全局 CSS 为 `.mm-canvas .smm-richtext-node-wrap p` 及 `ol/ul/pre/blockquote/h1~h6` 追加 `margin:0; padding:0`。simple-mind-map 官方 CSS 只 reset 了 `.ql-editor`（富文本编辑器），未覆盖渲染节点用的 `.smm-richtext-node-wrap`，此处补齐兜底
  - 验证：Playwright 复现（注入 3 级树：中心主题/子节点A-B-C/孙节点A1-A2），`<p>` 的 `marginTop/marginBottom` 由 `16px` 变 `0px`，`foreignObject.scrollHeight` 由 `51` 收敛到 `20`（与盒子高度一致），整图节点文字完整清晰显示；dist 产物 `index-*.css` 已含该规则

### v0.3.4（2026-09-04）

- 思维导图显示优化（保留 simple-mind-map 直到迁移完成）
  - 关闭 `view.fit()`，改用 `view.setScale(1) + view.reset()` 居中显示，避免窄容器下整图被等比缩小到文字几乎不可读
  - 渲染后强制覆盖 SVG `<text>` 元素的 `font-family` 属性（CSS 改不动 SVG 属性，必须 JS 补刀）
  - 全局 CSS 追加 `.mm-canvas svg * { font-family: var(--font); }` 兜底层
- 新增 POC 对比页 `poc/mindmap-compare.html`：simple-mind-map vs mind-elixir-core，左右并排、自包含 vendor 副本、常驻 20100 端口服务
- 输出思维导图引擎替换方案 `docs/思维导图引擎替换方案.md`（4 阶段、风险、回退、验收标准）
- 输出未来功能升级独立文档 `docs/未来功能升级.md`：近/中/远期 + 模块化升级矩阵 + 决策日志 + 增量模板
- 设计文档 §9 由「可选事项列表」升级为路线图索引，README 路线图章节同步为三段式速览（近/中/远期）

### v0.3.3（2026-09-04）

- 全局字体对齐 Excalidraw 官网：引入开源字体 `Assistant`（Google Fonts，OFL 协议）作为 UI 首选字体，回退 `system-ui → -apple-system → Segoe UI → PingFang SC → Microsoft YaHei`；`--font` 变量统一驱动，引擎内可通过覆盖 `--font` 或元素 `font-family` 单独设置
- 修复思维导图节点字体不跟随全局：simple-mind-map 主题默认写死「微软雅黑」，在 `THEME_CONFIG` 中显式覆盖 `root/second/node/generalization` 的 `fontFamily` 与 `associativeLineTextFontFamily` 为全局字体栈
- README 与设计文档新增「同类开源项目」章节：聚合绘图（tldraw、AI Draw Nexus）、图表（draw.io、Mermaid、D2）、白板（Excalidraw）、思维导图（simple-mind-map、mind-elixir-core、markmap、jsmind、butterfly），附对比表

### v0.3.2（2026-09-04）

- 端口规范统一：项目占用端口改为 200xx 段（开发 20001 / 预览 20002 / draw.io 自托管示例 20003），`tauri.conf.json` 的 `devUrl` 同步更新；不设 `strictPort`，端口被占用时自动顺延
- 修复局域网无法访问：`server.host` / `preview.host` 设为 `true`（监听 `0.0.0.0`）。此前 Vite 默认只绑 `localhost`（Node 17+ 解析为 IPv6 `::1`），本机 IP 一律连不上
- 修复思维导图节点宽度失真：删除 `.mm-canvas > div { width/height: 100% }` 规则。该规则误伤 simple-mind-map append 到容器里的隐藏富文本测宽元素，导致测宽恒为 `textAutoWrapWidth` 上限（500px），所有节点固定 530px 宽、与文字长短无关
- 修复后：节点宽度自适应文字（短文字节点约 95px），长文字按 500px 上限正常换行、完整显示无截断；Playwright 实测验证

### v0.3.0（2026-09-03）

- 补齐导入能力，数据闭环完整：`EngineAdapter` 新增 `importAs`，新增统一导入菜单与 `utils/file.ts`
- draw.io 支持 `.drawio` / `.xml` 导入；Excalidraw 支持 `.excalidraw` 场景导入（走官方 `restore()` 修复元素与箭头绑定）；思维导图支持 JSON / Markdown / XMind 三种导入
- 导入失败统一转为可读中文提示，含格式不符、JSON 损坏、XMind 解析异常三类
- 端到端实测：构造四类真实样本（drawio / excalidraw / md / xmind）驱动 Playwright 完成导入与落盘校验，7 项检查全部通过

### v0.2.1（2026-09-02）

- 首屏体积优化：三大引擎改为 `React.lazy` 动态导入 + `Suspense` 加载态，首屏 2974.6 KB → **231.8 KB**（gzip 951.4 → 73.5 KB），降幅 92%
- 构建配置调整：`manualChunks` 只拆首屏公共依赖（react / 图标），引擎拆分交给动态 import 驱动
- 补齐 favicon（内联 SVG，消除控制台 404）
- 清理 dist 历史残留产物，恢复全量构建

### v0.2.0（2026-09-02）

- 存储层重构：localStorage + IndexedDB 分层，大对象自动分流，配额异常用户可见，支持快照导出/导入/清空
- 引入 `EngineAdapter` 引擎适配器层，统一保存/导出/缩放/撤销重做调度
- draw.io：暗色主题同步、自托管地址配置、加载超时降级与重试
- Excalidraw：appState 裁剪、图片文件持久化、缩放控制、PNG/SVG/JSON 导出
- 思维导图：撤销/重做、缩放控制、resize 适配、深色主题、6 种导出格式
- UI：可折叠侧边栏、统一导出菜单、设置/关于弹窗、Toast 提示、状态栏缩放与存储用量
- 快捷键新增 `Ctrl/Cmd + B` 折叠侧边栏，输入框内自动让行

### v0.1.0（2026-09-02）

- 三大引擎聚合、Tab 切换、localStorage 持久化、主题切换、基础快捷键、Tauri 骨架

---

## 9. 后续规划（详见 `docs/未来功能升级.md`）

> 完整路线图已独立成文，按「近期待办 / 中期规划 / 远期愿景」分类，每条含目标、痛点、设计要点、验收、估时、关联模块。本节仅给一张速览表。

### 9.1 速览

| 类别 | 近期待办（v0.4–v0.5） | 中期规划（v0.6–v0.8） | 远期愿景（v1.0+） |
|------|----------------------|------------------------|---------------------|
| 引擎 | 思维导图替换 → mind-elixir-core（F-01） | 接入 Mermaid / Markmap / PlantUML / 甘特 | 硬件加速、WebGPU 渲染 |
| 产品 | 多文档（F-02）、全局搜索（F-03）、ZIP 导出（F-07） | 跨引擎互转（P-01）、AI 润色（P-02）、协同编辑（P-03） | DrawHub Cloud、插件市场 |
| 工程 | 启动骨架屏（G-02）、状态栏节点数（F-09） | i18n（G-03）、性能预算（G-04） | OPFS 单文件流式读写 |
| 生态 | 桌面自动更新（F-06） | Tauri 移动端壳 | 移动端适配 |

### 9.2 优先级排序原则

1. 用户反馈频率（多 → 高）
2. 维护成本可控（拆包/迁移 < 3 人日/任务）
3. 与「隐私优先 / 纯前端」基线对齐
4. 与 PWA / Tauri 多端能力匹配

### 9.3 增量条目模板

任何新增条目请在 [`docs/未来功能升级.md`](未来功能升级.md) 用以下格式提交 PR：

```
### F-XX | 名称
- 目标：
- 现状 / 痛点：
- 设计要点：
- 验收标准：
- 估时：
- 关联：
- 风险与回退：
```

完整内容请阅读 [`docs/未来功能升级.md`](未来功能升级.md)。
