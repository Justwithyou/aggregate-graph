import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  WifiOff,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  FolderOpen,
} from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { storage, STORAGE_KEYS } from '../../services/storage';
import { files as fileService, filesReady } from '../../services/files';
import { DRAWIO_EMBED_PARAMS, ENGINE_META } from '../../constants';
import { downloadDataUrl, downloadText, stampName } from '../../utils/download';
import type { EngineAdapter, ExportFormat, ImportFormat } from '../../types';

/** draw.io 嵌入模式（proto=json）下接收到的消息 */
interface DrawioMessage {
  event?: string;
  xml?: string;
  data?: string;
}

/** 本组件收到的导出格式 → draw.io export action 的 format 参数 */
const EXPORT_FORMAT_MAP: Partial<Record<ExportFormat, string>> = {
  png: 'png',
  svg: 'xmlsvg',
  xml: 'xml',
};

/** 超过该秒数仍未就绪，提示"加载较慢"（不阻塞，仅顶部轻提示） */
const SLOW_AFTER = 8;
/** 超过该秒数判定为受阻（仍不阻塞 iframe，仅展开诊断面板） */
const BLOCK_AFTER = 30;

/** 默认示例图：首次使用时给用户一个可立即编辑的起点 */
const DEFAULT_DRAWIO_XML =
  '<mxfile host="app.diagrams.net"><diagram id="drawhub-default" name="Page-1">' +
  '<mxGraphModel dx="1169" dy="827" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">' +
  '<root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="n1" value="DrawHub" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;fontStyle=1" vertex="1" parent="1">' +
  '<mxGeometry x="500" y="120" width="180" height="50" as="geometry"/></mxCell>' +
  '<mxCell id="n2" value="draw.io 图表" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">' +
  '<mxGeometry x="330" y="250" width="160" height="50" as="geometry"/></mxCell>' +
  '<mxCell id="n3" value="Excalidraw 白板" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#ffe6cc;strokeColor=#d79b00;" vertex="1" parent="1">' +
  '<mxGeometry x="530" y="250" width="160" height="50" as="geometry"/></mxCell>' +
  '<mxCell id="n4" value="思维导图" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#e1d5e7;strokeColor=#9673a6;" vertex="1" parent="1">' +
  '<mxGeometry x="730" y="250" width="160" height="50" as="geometry"/></mxCell>' +
  '<mxCell id="e1" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="n1" target="n2">' +
  '<mxGeometry relative="1" as="geometry"/></mxCell>' +
  '<mxCell id="e2" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="n1" target="n3">' +
  '<mxGeometry relative="1" as="geometry"/></mxCell>' +
  '<mxCell id="e3" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="n1" target="n4">' +
  '<mxGeometry relative="1" as="geometry"/></mxCell>' +
  '</root></mxGraphModel></diagram></mxfile>';

/** 构造嵌入地址：合并固定参数、主题参数与用户自定义 base */
function buildEmbedUrl(baseUrl: string, theme: 'light' | 'dark'): string {
  try {
    const url = new URL(baseUrl);
    new URLSearchParams(DRAWIO_EMBED_PARAMS).forEach((v, k) => url.searchParams.set(k, v));
    if (theme === 'dark') {
      url.searchParams.set('ui', 'dark');
      url.searchParams.set('dark', '1');
    } else {
      url.searchParams.delete('ui');
      url.searchParams.delete('dark');
    }
    return url.toString();
  } catch {
    // base 非法时退回官方地址
    return `https://embed.diagrams.net/?${DRAWIO_EMBED_PARAMS}${theme === 'dark' ? '&ui=dark&dark=1' : ''}`;
  }
}

/** draw.io 文件的合法根节点：<mxfile>（含 <mxGraphModel>） */
function isDrawioXml(xml: string): boolean {
  return /<mxfile[\s>]/i.test(xml);
}

function originOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return 'https://embed.diagrams.net';
  }
}

/**
 * 宿主页面自身是否为「不透明来源」。
 *
 * 典型场景：直接双击打开 dist/index.html（file:// 协议）。此时宿主 origin 为 null，
 * 第三方 iframe 内的 localStorage 会被浏览器直接拒绝，draw.io 无法完成初始化。
 * 这种情况必须在挂载 iframe 之前就明确告知，否则用户只会看到一个永远转不完的圈。
 */
function isOpaqueHost(): boolean {
  try {
    return (
      window.location.protocol === 'file:' ||
      window.location.origin === 'null' ||
      window.origin === 'null'
    );
  } catch {
    return false;
  }
}

interface DiagResult {
  online: boolean;
  /** null = 探测未完成/不支持 */
  reachable: boolean | null;
  hostOrigin: string;
  secureContext: boolean;
}

/** 加载受阻时的环境诊断，用于给出可执行的下一步建议 */
async function diagnose(baseUrl: string): Promise<DiagResult> {
  const base: DiagResult = {
    online: navigator.onLine,
    reachable: null,
    hostOrigin: (() => {
      try {
        return window.location.origin;
      } catch {
        return '(未知)';
      }
    })(),
    secureContext: window.isSecureContext,
  };
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 6000);
    // no-cors：成功返回 opaque 响应，失败会 reject，足以判断"地址是否可达"
    await fetch(baseUrl, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    window.clearTimeout(timer);
    base.reachable = true;
  } catch {
    base.reachable = false;
  }
  return base;
}

export default function DrawIOView() {
  const theme = useAppStore((s) => s.theme);
  const drawioBaseUrl = useAppStore((s) => s.settings.drawioBaseUrl);
  const autosaveDelay = useAppStore((s) => s.settings.autosaveDelay);
  const setEngineStatus = useAppStore((s) => s.setEngineStatus);
  const registerAdapter = useAppStore((s) => s.registerAdapter);
  const unregisterAdapter = useAppStore((s) => s.unregisterAdapter);
  const markSaved = useAppStore((s) => s.markSaved);
  const pushToast = useAppStore((s) => s.pushToast);
  const setDialog = useAppStore((s) => s.setDialog);

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const xmlRef = useRef<string>(DEFAULT_DRAWIO_XML);
  const pendingXmlRef = useRef<string>(DEFAULT_DRAWIO_XML);
  const readyRef = useRef(false);
  const bootedRef = useRef(false);
  const blockedRef = useRef(false);
  const lastThemeRef = useRef(theme);
  const saveTimerRef = useRef<number | null>(null);
  const exportWaiterRef = useRef<{ format: string; resolve: (data: string | null) => void } | null>(
    null,
  );

  const [booted, setBooted] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [waited, setWaited] = useState(0);
  const [slow, setSlow] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [diag, setDiag] = useState<DiagResult | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const opaqueHost = useMemo(isOpaqueHost, []);
  const allowedOrigin = originOf(drawioBaseUrl);

  /** 向 iframe 发送消息。
   *  draw.io embed 协议（proto=json）要求消息体必须是 JSON 字符串：
   *  传原始对象会被结构化克隆，对端 JSON.parse 直接失败且无任何报错。 */
  const post = useCallback(
    (message: Record<string, unknown>) => {
      iframeRef.current?.contentWindow?.postMessage(JSON.stringify(message), allowedOrigin);
    },
    [allowedOrigin],
  );

  const flushPersist = useCallback(() => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const xml = xmlRef.current;
    // 优先写进「本地文件目录树」的当前活动文件；没有活动文件时退回单键存档
    const id = useAppStore.getState().activeFileId.drawio;
    if (id) {
      void fileService.write(id, xml).then(() => useAppStore.getState().refreshFiles());
    } else {
      void storage.setRaw(STORAGE_KEYS.DRAWIO_XML, xml);
    }
    markSaved('drawio');
  }, [markSaved]);

  const schedulePersist = useCallback(() => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushPersist, autosaveDelay);
  }, [autosaveDelay, flushPersist]);

  const rebuild = useCallback(
    (nextTheme: 'light' | 'dark') => {
      readyRef.current = false;
      blockedRef.current = false;
      setReady(false);
      setBlocked(false);
      setSlow(false);
      setWaited(0);
      setDiag(null);
      setEngineStatus('drawio', 'loading');
      setSrc(buildEmbedUrl(drawioBaseUrl, nextTheme));
      setReloadKey((k) => k + 1);
    },
    [drawioBaseUrl, setEngineStatus],
  );

  /** 请求 draw.io 导出指定格式，返回数据（data URL 或 XML 原文） */
  const requestExport = useCallback(
    (format: string): Promise<string | null> => {
      if (!readyRef.current) return Promise.resolve(null);
      return new Promise((resolve) => {
        exportWaiterRef.current = { format, resolve };
        post({ action: 'export', format });
        window.setTimeout(() => {
          if (exportWaiterRef.current) {
            exportWaiterRef.current.resolve(null);
            exportWaiterRef.current = null;
          }
        }, 10000);
      });
    },
    [post],
  );

  // 启动：先读取当前活动文件的内容，再挂载 iframe，确保 init 时即有数据可用
  useEffect(() => {
    let cancelled = false;
    setEngineStatus('drawio', 'loading');
    void (async () => {
      // 引擎挂载早于 App 的 effect，用 filesReady() 确保索引与迁移已完成
      const { active } = await filesReady();
      const id = active.drawio ?? useAppStore.getState().activeFileId.drawio;
      let xml = id ? await fileService.read(id) : null;
      // 老版本单键存档兜底
      if (xml === null) xml = await storage.getRaw(STORAGE_KEYS.DRAWIO_XML);
      if (cancelled) return;
      pendingXmlRef.current = xml || DEFAULT_DRAWIO_XML;
      xmlRef.current = pendingXmlRef.current;
      bootedRef.current = true;
      setBooted(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 启动完成或自托管地址变化时重建 iframe
  useEffect(() => {
    if (!booted) return;
    rebuild(theme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booted, drawioBaseUrl]);

  // 主题变化：先取回最新 XML，再重建 iframe 以应用 draw.io 的深色 UI
  useEffect(() => {
    if (!bootedRef.current) return;
    if (lastThemeRef.current === theme) return;
    lastThemeRef.current = theme;
    let cancelled = false;
    void (async () => {
      const xml = readyRef.current ? await requestExport('xml') : null;
      if (cancelled) return;
      if (xml) {
        xmlRef.current = xml;
        pendingXmlRef.current = xml;
      }
      rebuild(theme);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // 等待计时：仅用于给出渐进式提示，不做任何阻塞式处理
  useEffect(() => {
    if (!src || ready) return;
    const timer = window.setInterval(() => setWaited((w) => w + 1), 1000);
    return () => window.clearInterval(timer);
  }, [src, reloadKey, ready]);

  useEffect(() => {
    if (waited >= SLOW_AFTER) setSlow(true);
  }, [waited]);

  // 超时判定为「受阻」：不遮住 iframe，只展开诊断面板
  useEffect(() => {
    if (waited < BLOCK_AFTER) return;
    if (readyRef.current || blockedRef.current) return;
    blockedRef.current = true;
    setBlocked(true);
    setEngineStatus('drawio', 'error');
    void diagnose(drawioBaseUrl).then(setDiag);
  }, [waited, drawioBaseUrl, setEngineStatus]);

  // 与 draw.io 的消息通信
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== allowedOrigin) return;
      // draw.io 发来的消息是 JSON 字符串（typeof 'string'），必须先解析
      let msg: DrawioMessage | null = null;
      try {
        msg = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      if (msg.event === 'init') {
        readyRef.current = true;
        blockedRef.current = false;
        setReady(true);
        setBlocked(false);
        setSlow(false);
        setEngineStatus('drawio', 'ready');
        // autosave:1 必须随 load 消息下发（draw.io 源码：autosave = data.autosave == 1），
        // 写在 URL 参数里无效；开启后每次编辑 draw.io 会主动推送 {event:'autosave', xml}
        post({ action: 'load', xml: pendingXmlRef.current, autosave: 1 });
        return;
      }

      if ((msg.event === 'save' || msg.event === 'autosave') && typeof msg.xml === 'string') {
        xmlRef.current = msg.xml;
        schedulePersist();
        return;
      }

      if (msg.event === 'export') {
        const data = typeof msg.data === 'string' ? msg.data : null;
        const waiter = exportWaiterRef.current;
        exportWaiterRef.current = null;
        waiter?.resolve(data);
        // 无等待者或等待 XML 的导出（如自动保存、Ctrl+S）统一落盘
        if (data && (!waiter || waiter.format === 'xml')) {
          xmlRef.current = data;
          flushPersist();
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [allowedOrigin, post, schedulePersist, flushPersist, setEngineStatus]);

  // 注册适配器
  useEffect(() => {
    const adapter: EngineAdapter = {
      save: async () => {
        const xml = await requestExport('xml');
        if (xml) xmlRef.current = xml;
        flushPersist();
      },
      getContent: async () => {
        if (readyRef.current) {
          const xml = await requestExport('xml');
          if (xml) return xml;
        }
        return xmlRef.current;
      },
      loadContent: async (content: string) => {
        // 空内容 = 新建文件，回到自带默认画布
        const xml = content && content.trim() ? content : DEFAULT_DRAWIO_XML;
        xmlRef.current = xml;
        pendingXmlRef.current = xml;
        if (readyRef.current) {
          post({ action: 'load', xml, autosave: 1 });
        }
        flushPersist();
      },
      exportAs: async (format) => {
        const target = EXPORT_FORMAT_MAP[format];
        if (!target) {
          pushToast('error', `draw.io 不支持导出 ${format.toUpperCase()}`);
          return;
        }
        const data = await requestExport(target);
        if (!data) {
          pushToast('error', '导出失败，请等待画布加载完成后重试');
          return;
        }
        if (data.startsWith('data:')) {
          downloadDataUrl(data, stampName('drawhub-drawio', format === 'svg' ? 'svg' : 'png'));
        } else {
          downloadText(data, stampName('drawhub-drawio', 'drawio.xml'), 'application/xml');
        }
        pushToast('success', `已导出 ${format.toUpperCase()}`);
      },
      importAs: async (format: ImportFormat, content: string | ArrayBuffer) => {
        if (format !== 'xml') {
          pushToast('error', `draw.io 不支持导入 ${format.toUpperCase()}`);
          return;
        }
        const xml =
          typeof content === 'string' ? content : new TextDecoder('utf-8').decode(content);
        if (!isDrawioXml(xml)) {
          throw new Error('不是有效的 draw.io 文件，根节点应为 <mxfile>');
        }
        xmlRef.current = xml;
        pendingXmlRef.current = xml;
        if (readyRef.current) {
          post({ action: 'load', xml });
        }
        flushPersist();
        if (!readyRef.current) {
          pushToast('info', '已保存，将在 draw.io 加载完成后生效');
        }
      },
    };
    registerAdapter('drawio', adapter);
    return () => {
      unregisterAdapter('drawio');
      exportWaiterRef.current = null;
    };
  }, [registerAdapter, unregisterAdapter, requestExport, flushPersist, pushToast, post]);

  // 卸载时立即落盘，避免丢失未触发 autosave 的编辑
  useEffect(
    () => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      const id = useAppStore.getState().activeFileId.drawio;
      const xml = xmlRef.current;
      if (id) void fileService.write(id, xml);
      else void storage.setRaw(STORAGE_KEYS.DRAWIO_XML, xml);
    },
    [],
  );

  const openInBrowser = () => {
    window.open(src ?? drawioBaseUrl, '_blank', 'noopener,noreferrer');
  };

  /** 根据诊断结果推断最可能的原因，给出对应的一句话结论 */
  const suspicion = (() => {
    if (opaqueHost) return 'opaque';
    if (diag && diag.reachable === false) return 'unreachable';
    if (diag && diag.reachable === true) return 'storage';
    if (diag && !diag.online) return 'offline';
    return 'unknown';
  })();

  return (
    <div className="engine-drawio">
      {src && (
        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={src}
          title={ENGINE_META.drawio.label}
          className="drawio-frame"
          allow="clipboard-read; clipboard-write; fullscreen; storage-access-by-user-activation"
          referrerPolicy="no-referrer-when-downgrade"
        />
      )}

      {!booted && <div className="engine-loading">正在读取本地存档…</div>}

      {/* 加载较慢的轻量提示：不遮挡，可继续操作 */}
      {slow && !ready && !blocked && !opaqueHost && (
        <div className="drawio-hint" role="status">
          <span className="drawio-hint__spinner" aria-hidden="true" />
          draw.io 仍在初始化…（已等待 {waited}s）
          <button className="link-btn" onClick={() => setShowDetail((v) => !v)}>
            详情
          </button>
        </div>
      )}

      {/* 受阻时的诊断面板：悬浮在画布之上，但 iframe 依旧可交互 */}
      {((blocked && !ready) || opaqueHost) && (
        <div className={`drawio-diag${opaqueHost ? ' fatal' : ''}`}>
          <div className="drawio-diag__head">
            <span className="drawio-diag__icon">
              {opaqueHost ? <FolderOpen size={17} /> : <ShieldAlert size={17} />}
            </span>
            <div className="drawio-diag__title">
              <strong>{opaqueHost ? '当前打开方式不支持 draw.io' : 'draw.io 未能完成初始化'}</strong>
              <span>
                {opaqueHost
                  ? 'file:// 协议下浏览器会禁止嵌入页面使用本地存储，draw.io 无法启动'
                  : `已等待 ${waited}s 仍未收到就绪信号`}
              </span>
            </div>
            <div className="drawio-diag__ops">
              {!opaqueHost && (
                <>
                  <button className="btn sm" onClick={() => rebuild(theme)}>
                    <RefreshCw size={13} /> 重新加载
                  </button>
                  <button className="btn sm" onClick={openInBrowser}>
                    <ExternalLink size={13} /> 在浏览器中打开
                  </button>
                </>
              )}
              {opaqueHost && (
                <button className="btn sm" onClick={openInBrowser}>
                  <ExternalLink size={13} /> 在浏览器中打开
                </button>
              )}
              <button
                className="icon-btn sm"
                title={showDetail ? '收起诊断信息' : '展开诊断信息'}
                onClick={() => setShowDetail((v) => !v)}
              >
                {showDetail ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>
            </div>
          </div>

          {showDetail && (
            <div className="drawio-diag__body">
              {suspicion === 'opaque' && (
                <>
                  <p>
                    DrawHub 通过 <code>iframe</code> 嵌入 draw.io，嵌入页需要读写自己的
                    localStorage。以 <code>file://</code> 直接打开 HTML 时宿主来源为
                    <code> null</code>，浏览器会直接拒绝第三方存储访问，draw.io 会一直停在加载动画上。
                  </p>
                  <p className="strong">请用本地服务方式打开：</p>
                  <pre className="code-block">{'npm run dev\n# 或\nnpm run preview'}</pre>
                  <p className="muted">
                    打包成 Tauri 桌面应用后使用的是 <code>http://tauri.localhost</code> 正常来源，不存在此问题。
                  </p>
                </>
              )}

              {suspicion === 'storage' && (
                <>
                  <p>
                    网络正常（已成功请求 <code>{drawioBaseUrl}</code>），但 draw.io 始终没有发出
                    就绪消息。这几乎总是因为浏览器阻止了第三方站点的本地存储。
                  </p>
                  <p className="strong">请任选其一：</p>
                  <ul>
                    <li>点击右上角「在浏览器中打开」，按 draw.io 页面上的提示放行后，再点「重新加载」。</li>
                    <li>
                      在 Chrome 地址栏左侧的「眼睛 / 调谐旋钮」图标中，选择
                      <b> 允许第三方 Cookie 与站点数据</b>，然后重新加载。
                    </li>
                    <li>
                      在设置 → 隐私和安全 → 第三方 Cookie 中，为 <code>diagrams.net</code> 放行。
                    </li>
                  </ul>
                </>
              )}

              {suspicion === 'unreachable' && (
                <>
                  <p>
                    无法访问 <code>{drawioBaseUrl}</code>。请检查网络、代理或公司防火墙。
                  </p>
                  <p className="muted">
                    内网 / 离线环境可在「设置」中填入自托管的 draw.io 地址。
                  </p>
                </>
              )}

              {suspicion === 'offline' && <p>当前设备处于离线状态，draw.io 嵌入版需要联网加载。</p>}

              {suspicion === 'unknown' && (
                <p>
                  正在确认原因…你也可以先点击「在浏览器中打开」确认 draw.io 本身是否可用。
                </p>
              )}

              <dl className="diag-list">
                <div>
                  <dt>宿主来源</dt>
                  <dd>{diag?.hostOrigin ?? window.location.origin}</dd>
                </div>
                <div>
                  <dt>嵌入地址</dt>
                  <dd>{drawioBaseUrl}</dd>
                </div>
                <div>
                  <dt>网络在线</dt>
                  <dd>{String(diag?.online ?? navigator.onLine)}</dd>
                </div>
                <div>
                  <dt>地址可达</dt>
                  <dd>{diag ? String(diag.reachable) : '探测中'}</dd>
                </div>
                <div>
                  <dt>已等待</dt>
                  <dd>{waited}s</dd>
                </div>
              </dl>

              <div className="drawio-diag__foot">
                <button className="btn sm" onClick={() => setDialog('settings')}>
                  打开设置
                </button>
                <span className="muted">Excalidraw 与思维导图不依赖网络，可继续离线使用。</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 完全离线且 iframe 尚未产出任何内容时，给一个安静的角标 */}
      {blocked && !ready && !showDetail && !opaqueHost && (
        <div className="drawio-badge">
          <WifiOff size={13} />
          <span>draw.io 未就绪</span>
          <button className="link-btn" onClick={() => setShowDetail(true)}>
            查看原因
          </button>
        </div>
      )}
    </div>
  );
}
