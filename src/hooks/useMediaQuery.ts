import { useEffect, useState } from 'react';

/**
 * 订阅 CSS 媒体查询。
 *
 * 侧边栏在窄视口（含浏览器放大导致 CSS 视口变窄）下会自动收成图标条，
 * 这里让 JS 与 CSS 的断点保持一致，从而可以直接决定是否渲染文字节点，
 * 而不是渲染后再用 CSS 藏起来（避免出现仍可聚焦的隐藏按钮）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    // Safari < 14 只有 addListener
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [query]);

  return matches;
}

/** 与 global.css 中侧边栏自动收窄的断点保持一致 */
export const NARROW_QUERY = '(max-width: 1000px)';
