/** 本地文件读取工具，供各引擎导入外部文件使用 */

/**
 * 弹出文件选择器。
 * 用临时 input 而非常驻 DOM，避免各引擎各自持有一个隐藏 input。
 * resolve(null) 表示用户取消了选择。
 */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    // 部分浏览器在取消时不触发 change，这里以 window focus 作为兜底判定
    window.addEventListener(
      'focus',
      () => {
        window.setTimeout(() => finish(null), 500);
      },
      { once: true },
    );

    document.body.appendChild(input);
    input.click();
  });
}

export function readAsText(file: File): Promise<string> {
  return file.text();
}

export function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

/** 取小写扩展名（不含点），无扩展名时返回空串 */
export function extOf(filename: string): string {
  const i = filename.lastIndexOf('.');
  return i === -1 ? '' : filename.slice(i + 1).toLowerCase();
}
